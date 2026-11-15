import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Standard-Loadouts (Werksausstattung) direkt aus der Star-Citizen-Wiki-API.
 *
 * `/api/v3/vehicles/{slug}?include=ports` liefert den kompletten Portbaum eines
 * Schiffes inklusive `equipped_item` — also exakt die Komponenten, die im Spiel
 * ab Werk verbaut sind. Wir normalisieren das auf dieselben UI-Buckets wie der
 * scunpacked-Sync und schreiben nach `ship_stock_loadouts` (source: "wiki").
 */

const WIKI = "https://api.star-citizen.wiki/api/v3/vehicles";

const PLACEHOLDER = /^<=\s*placeholder\s*=>$/i;

/** Wiki `category_label` → unsere Loadout-Kategorien. */
const CATEGORY_MAP: Record<string, string> = {
  Weapons: "Weapons",
  Turrets: "Weapons",
  "Manned Turrets": "Weapons",
  "Remote Turrets": "Weapons",
  "Missile & Bomb Racks": "Missile & Bomb Racks",
  Shields: "Shield Generators",
  "Shield Generators": "Shield Generators",
  Radars: "Radar",
  Radar: "Radar",
  "Quantum Drives": "Quantum Drives",
  "Power Plants": "Power Plants",
  Coolers: "Coolers",
};

type WikiItem = {
  uuid?: string | null;
  name?: string | null;
  class_name?: string | null;
  size?: number | null;
  manufacturer?: { name?: string | null } | null;
};

type WikiPort = {
  name?: string | null;
  class_name?: string | null;
  type?: string | null;
  category_label?: string | null;
  sizes?: { max?: number | null } | null;
  equipped_item?: WikiItem | null;
  ports?: WikiPort[] | null;
};

export type WikiStockEntry = {
  category: string;
  port_name: string | null;
  class_name: string;
  size: number | null;
  item_ref: string | null;
  item_name: string | null;
  manufacturer: string | null;
};

type CatalogHit = {
  item_ref: string;
  name: string;
  manufacturer: string | null;
  size: number | null;
};

function flattenPorts(
  ports: WikiPort[] | null | undefined,
  inherited: string | null,
  out: WikiStockEntry[] = [],
): WikiStockEntry[] {
  for (const p of ports ?? []) {
    const label = p.category_label ?? null;
    const category = (label && CATEGORY_MAP[label]) ?? inherited ?? null;
    const item = p.equipped_item ?? null;
    const cls = item?.class_name ?? p.class_name ?? null;
    const name = item?.name ?? null;
    const usable = !!cls && !!name && !PLACEHOLDER.test(name);
    if (category && usable) {
      out.push({
        category,
        port_name: p.name ?? null,
        class_name: cls as string,
        size: item?.size ?? p.sizes?.max ?? null,
        item_ref: null,
        item_name: name,
        manufacturer: item?.manufacturer?.name ?? null,
      });
    }
    if (p.ports?.length) flattenPorts(p.ports, category, out);
  }
  return out;
}

type WikiVehicleRef = {
  slug: string;
  class_name: string | null;
  name: string | null;
  game_name: string | null;
};

async function fetchVehicleSlugs(): Promise<WikiVehicleRef[]> {
  const out: WikiVehicleRef[] = [];
  let page = 1;
  let last = 1;
  do {
    const res = await fetch(`${WIKI}?limit=200&page=${page}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Wiki /vehicles ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        slug?: string | null;
        class_name?: string | null;
        name?: string | null;
        game_name?: string | null;
      }>;
      meta?: { last_page?: number };
    };
    for (const v of json.data ?? []) {
      if (v.slug)
        out.push({
          slug: v.slug,
          class_name: v.class_name ?? null,
          name: v.name ?? null,
          game_name: v.game_name ?? null,
        });
    }
    last = json.meta?.last_page ?? 1;
    page++;
  } while (page <= last && page <= 20);
  return out;
}

async function fetchVehiclePorts(slug: string): Promise<WikiPort[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${WIKI}/${encodeURIComponent(slug)}?include=ports`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { ports?: WikiPort[] | null } };
      return json.data?.ports ?? null;
    } catch {
      if (attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");
}

/** Komponenten-Katalog nach `class_name` indizieren (PostgREST-Paginierung!). */
async function loadComponentIndex(): Promise<Map<string, CatalogHit>> {
  const byClass = new Map<string, CatalogHit>();
  const PAGE = 1000;
  for (let from = 0; from < 40_000; from += PAGE) {
    const { data } = await supabaseAdmin
      .from("ship_components_catalog")
      .select("item_ref, name, manufacturer_name, size, raw")
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const c of data) {
      const raw = (c.raw as Record<string, unknown> | null) ?? null;
      const cls = (raw?.class_name as string | null) ?? null;
      const entry: CatalogHit = {
        item_ref: c.item_ref as string,
        name: c.name as string,
        manufacturer: (c.manufacturer_name as string | null) ?? null,
        size: (c.size as number | null) ?? null,
      };
      if (cls) {
        const lc = cls.toLowerCase();
        if (!byClass.has(lc)) byClass.set(lc, entry);
        const stripped = lc.replace(/_scitem$/i, "");
        if (!byClass.has(stripped)) byClass.set(stripped, entry);
      }
      const nameKey = `name:${norm(c.name as string)}`;
      if (!byClass.has(nameKey)) byClass.set(nameKey, entry);
    }
    if (data.length < PAGE) break;
  }
  return byClass;
}

export async function runStockLoadoutWikiSync(opts?: {
  /** Nur Schiffe ohne (oder mit leerem) Standard-Loadout schreiben. */
  onlyMissing?: boolean;
  shipSlugs?: string[];
}): Promise<{
  vehicles: number;
  matched: number;
  written: number;
  skipped: number;
  slots: number;
  resolved: number;
  unmatched: string[];
}> {
  const onlyMissing = opts?.onlyMissing ?? false;

  const { data: catalog, error } = await supabaseAdmin
    .from("ship_catalog")
    .select("slug,name")
    .limit(3000);
  if (error) throw new Error(error.message);

  const bySlug = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of catalog ?? []) {
    bySlug.set(norm(row.slug as string), row.slug as string);
    byName.set(norm(row.name as string), row.slug as string);
  }

  const { data: existing } = await supabaseAdmin
    .from("ship_stock_loadouts")
    .select("ship_slug, loadout")
    .limit(3000);
  const filled = new Set(
    (existing ?? [])
      .filter((r) => Array.isArray(r.loadout) && (r.loadout as unknown[]).length > 0)
      .map((r) => r.ship_slug as string),
  );

  const components = await loadComponentIndex();
  let vehicles = await fetchVehicleSlugs();
  if (opts?.shipSlugs?.length) {
    const wanted = new Set(opts.shipSlugs.map((s) => norm(s)));
    vehicles = vehicles.filter((v) => wanted.has(norm(v.slug)));
  }

  let matched = 0;
  let written = 0;
  let skipped = 0;
  let slots = 0;
  let resolved = 0;
  const unmatched: string[] = [];
  const now = new Date().toISOString();

  for (const v of vehicles) {
    const shipSlug =
      bySlug.get(norm(v.slug)) ??
      byName.get(norm(v.slug)) ??
      byName.get(norm(v.name)) ??
      byName.get(norm(v.game_name)) ??
      null;
    if (!shipSlug) {
      unmatched.push(v.slug);
      continue;
    }
    matched++;
    if (onlyMissing && filled.has(shipSlug)) {
      skipped++;
      continue;
    }

    const ports = await fetchVehiclePorts(v.slug);
    const entries = flattenPorts(ports, null);
    if (entries.length === 0) {
      skipped++;
      continue;
    }

    for (const e of entries) {
      const lc = e.class_name.toLowerCase();
      const hit =
        components.get(lc) ??
        components.get(lc.replace(/_scitem$/i, "")) ??
        components.get(`name:${norm(e.item_name)}`) ??
        null;
      if (hit) {
        e.item_ref = hit.item_ref;
        e.item_name = hit.name;
        e.manufacturer = e.manufacturer ?? hit.manufacturer;
        e.size = e.size ?? hit.size;
        resolved++;
      }
    }
    slots += entries.length;

    const { error: upErr } = await supabaseAdmin.from("ship_stock_loadouts").upsert(
      {
        ship_slug: shipSlug,
        class_name: v.class_name ?? shipSlug,
        loadout: entries as unknown as never,
        source: "star-citizen.wiki",
        fetched_at: now,
      },
      { onConflict: "ship_slug" },
    );
    if (upErr) {
      skipped++;
      continue;
    }
    written++;
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    vehicles: vehicles.length,
    matched,
    written,
    skipped,
    slots,
    resolved,
    unmatched: unmatched.slice(0, 40),
  };
}
