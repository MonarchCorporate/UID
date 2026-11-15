import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

export const syncWikiItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { syncWikiItemsAll } = await import("./items-wiki-sync.server");
    return await syncWikiItemsAll();
  });

export type WikiSyncRunStatus = {
  id: string;
  status: "running" | "success" | "error";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  inserted: number | null;
  scanned: number | null;
  pages: number | null;
  error_message: string | null;
};

export const getWikiSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WikiSyncRunStatus | null> => {
    const { data } = await context.supabase
      .from("wiki_sync_runs")
      .select("id, status, started_at, finished_at, duration_ms, inserted, scanned, pages, error_message")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const d = data as Record<string, unknown>;
    return {
      id: d.id as string,
      status: (d.status as WikiSyncRunStatus["status"]) ?? "success",
      started_at: d.started_at as string,
      finished_at: (d.finished_at as string | null) ?? null,
      duration_ms: (d.duration_ms as number | null) ?? null,
      inserted: (d.inserted as number | null) ?? null,
      scanned: (d.scanned as number | null) ?? null,
      pages: (d.pages as number | null) ?? null,
      error_message: (d.error_message as string | null) ?? null,
    };
  });

// ---------- Wiki item detail (on-demand) ----------

export type WikiItemImage = {
  original_url?: string | null;
  thumbnail_url?: string | null;
};

export type WikiItemPort = {
  name?: string | null;
  display_name?: string | null;
  position?: string | null;
  size?: number | null;
  type?: string | null;
  sub_type?: string | null;
};

export type WikiItemDetail = {
  slug: string;
  uuid: string | null;
  name: string;
  classification_label?: string | null;
  type_label?: string | null;
  sub_type_label?: string | null;
  size?: number | null;
  mass?: number | null;
  rarity?: string | null;
  is_craftable?: boolean | null;
  is_lootable?: boolean | null;
  description_de?: string | null;
  description_en?: string | null;
  description_data: Array<{ name: string; value: string }>;
  images: WikiItemImage[];
  manufacturer?: { name?: string | null; code?: string | null; link?: string | null } | null;
  personal_weapon?: any;
  armor?: any;
  ports: WikiItemPort[];
  tags: string[];
  web_url?: string | null;
  updated_at?: string | null;
  version?: string | null;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["'`´’.,()\[\]{}!?*+/\\]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Simple in-memory cache with TTL (per worker instance).
const CACHE = new Map<string, { at: number; value: WikiItemDetail | null }>();
const TTL_MS = 30 * 60 * 1000;

async function fetchWikiBySlugOrUuid(key: string): Promise<any | null> {
  const url = `https://api.star-citizen.wiki/api/items/${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchWikiByName(name: string): Promise<any | null> {
  const url = `https://api.star-citizen.wiki/api/items?filter[name]=${encodeURIComponent(
    name,
  )}&limit=1`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json: any = await res.json();
    const first = json?.data?.[0];
    if (!first) return null;
    // Listen-Endpoint liefert weniger Felder → über uuid/slug nachladen
    const key = first.slug ?? first.uuid;
    if (!key) return first;
    return (await fetchWikiBySlugOrUuid(key)) ?? first;
  } catch {
    return null;
  }
}

async function fetchWikiBySearch(name: string): Promise<any | null> {
  const url = `https://api.star-citizen.wiki/api/items/search?limit=1`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ query: name }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const first = json?.data?.[0];
    if (!first) return null;
    const key = first.slug ?? first.uuid;
    if (!key) return first;
    return (await fetchWikiBySlugOrUuid(key)) ?? first;
  } catch {
    return null;
  }
}

function mapWikiDetail(d: any): WikiItemDetail {
  const desc = d.description ?? {};
  return {
    slug: String(d.slug ?? ""),
    uuid: d.uuid ?? null,
    name: String(d.name ?? ""),
    classification_label: d.classification_label ?? null,
    type_label: d.type_label ?? null,
    sub_type_label: d.sub_type_label ?? null,
    size: d.size ?? null,
    mass: d.mass ?? null,
    rarity: d.rarity ?? null,
    is_craftable: d.is_craftable ?? null,
    is_lootable: d.is_lootable ?? null,
    description_de: desc.de_DE ?? null,
    description_en: desc.en_EN ?? null,
    description_data: Array.isArray(d.description_data)
      ? d.description_data.map((r: any) => ({
          name: String(r.name ?? ""),
          value: String(r.value ?? ""),
        }))
      : [],
    images: Array.isArray(d.images) ? d.images : [],
    manufacturer: d.manufacturer ?? null,
    personal_weapon: d.personal_weapon ?? null,
    armor: d.armor ?? null,
    ports: Array.isArray(d.ports) ? d.ports : [],
    tags: Array.isArray(d.tags) ? d.tags : [],
    web_url: d.web_url ?? null,
    updated_at: d.updated_at ?? null,
    version: d.version ?? null,
  };
}

export const getWikiItemDetail = createServerFn({ method: "GET" })
  .inputValidator((input: { item_ref: string }) => input)
  .handler(async ({ data }): Promise<WikiItemDetail | null> => {
    const ref = data.item_ref?.trim();
    if (!ref) return null;

    const cached = CACHE.get(ref);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cat } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select("item_ref, name, wiki_uuid, image_url")
      .eq("item_ref", ref)
      .maybeSingle();

    let raw: any = null;
    if (cat?.wiki_uuid) raw = await fetchWikiBySlugOrUuid(cat.wiki_uuid);
    if (!raw && cat?.name) {
      const slug = slugify(cat.name);
      if (slug) raw = await fetchWikiBySlugOrUuid(slug);
    }
    if (!raw && cat?.name) raw = await fetchWikiByName(cat.name);
    if (!raw && cat?.name) raw = await fetchWikiBySearch(cat.name);
    // Falls ref selbst schon ein Slug/UUID ist
    if (!raw) raw = await fetchWikiBySlugOrUuid(ref);

    const mapped = raw ? mapWikiDetail(raw) : null;
    CACHE.set(ref, { at: Date.now(), value: mapped });

    // Opportunistisch Katalog anreichern
    if (mapped && cat) {
      const patch: Record<string, unknown> = {};
      if (!cat.wiki_uuid && mapped.uuid) patch.wiki_uuid = mapped.uuid;
      if (!cat.image_url && mapped.images[0]?.thumbnail_url)
        patch.image_url = mapped.images[0].thumbnail_url;
      if (Object.keys(patch).length) {
        await supabaseAdmin
          .from("inventory_item_catalog")
          .update(patch as any)
          .eq("item_ref", ref);
      }
    }

    return mapped;
  });