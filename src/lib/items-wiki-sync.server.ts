import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WIKI_BASE = "https://api.star-citizen.wiki/api";

async function fetchJson<T = unknown>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

type Paged<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
};

type UexPurchase = {
  price_buy?: number | null;
  price_sell?: number | null;
  terminal_name?: string | null;
  terminal_code?: string | null;
  starmap_location?: {
    name?: string | null;
    parent_name?: string | null;
    star_system_name?: string | null;
  } | null;
  date_updated?: string | null;
  uex_link?: string | null;
};

type WikiItem = {
  uuid: string;
  slug?: string | null;
  name: string;
  classification: string | null;
  classification_label?: string | null;
  description?: Record<string, string> | null;
  mass?: number | null;
  size?: number | null;
  type?: string | null;
  type_label?: string | null;
  sub_type_label?: string | null;
  manufacturer?: { name?: string | null; code?: string | null } | null;
  images?: Array<{
    url?: string | null;
    original_url?: string | null;
    thumbnail_url?: string | null;
  }> | null;
  uex_prices?: { purchase?: UexPurchase[] | null } | null;
  web_url?: string | null;
};

/**
 * Only character/FPS/personal items. Ship components run through the
 * dedicated ship-components-sync and are skipped here.
 */
const RELEVANT_PREFIXES = [
  // Character / FPS items (current Wiki classification namespace)
  "FPS.",
  "Char.",
  // Personal weapons + attachments
  "Weapon.Personal",
  "WeaponPersonal",
  // Legacy / alternative prefixes still occasionally present
  "Item.Armor",
  "Item.Helmet",
  "Item.Undersuit",
  "Item.Backpack",
  "Item.Clothing",
  "Item.Consumable",
  "Item.Tool",
  "Item.Medical",
  "Item.Mining",
  "Item.Salvage",
  "Item.Scanning",
  "Item.MobiGlas",
  "Item.Attachment",
  "Item.Magazine",
  "Item.Grenade",
  "Item.Utility",
];

const EXCLUDE_PREFIXES = ["Ship.", "Vehicle."];

function isRelevant(classification: string | null | undefined): boolean {
  if (!classification) return false;
  if (EXCLUDE_PREFIXES.some((p) => classification.startsWith(p))) return false;
  return RELEVANT_PREFIXES.some((p) => classification.startsWith(p));
}

function pickDescription(d: Record<string, string> | null | undefined): string | null {
  if (!d) return null;
  return d.de_DE ?? d.en_EN ?? Object.values(d)[0] ?? null;
}

function mapShops(item: WikiItem) {
  const list = item.uex_prices?.purchase ?? [];
  return list.map((s) => ({
    terminal_name: s.terminal_name ?? null,
    terminal_code: s.terminal_code ?? null,
    location: s.starmap_location?.name ?? null,
    parent: s.starmap_location?.parent_name ?? null,
    system: s.starmap_location?.star_system_name ?? null,
    price_buy: s.price_buy ?? null,
    price_sell: s.price_sell ?? null,
    date_updated: s.date_updated ?? null,
    uex_link: s.uex_link ?? null,
  }));
}

function minBuyPrice(shops: ReturnType<typeof mapShops>): number | null {
  let min: number | null = null;
  for (const s of shops) {
    if (s.price_buy != null && s.price_buy > 0) {
      if (min == null || s.price_buy < min) min = s.price_buy;
    }
  }
  return min;
}

function mapRow(item: WikiItem, now: string) {
  if (!isRelevant(item.classification)) return null;
  const shops = mapShops(item);
  const description = pickDescription(item.description);
  return {
    item_ref: `wiki:${item.uuid}`,
    wiki_uuid: item.uuid,
    name: item.name,
    kind:
      item.type_label ??
      item.classification_label ??
      item.sub_type_label ??
      null,
    unit: "pcs" as const,
    weight: item.mass ?? null,
    image_url:
      item.images?.[0]?.thumbnail_url ??
      item.images?.[0]?.original_url ??
      item.images?.[0]?.url ??
      null,
    price_buy: minBuyPrice(shops),
    price_sell: null,
    source: "wiki",
    description,
    shops,
    raw: {
      classification: item.classification,
      classification_label: item.classification_label,
      // game class name (e.g. "behr_rifle_ballistic_01") – lets the companion map Game.log items to the catalog
      class_name: (item as { class_name?: string | null }).class_name ?? null,
      manufacturer: item.manufacturer ?? null,
      web_url: item.web_url ?? null,
      slug: item.slug ?? null,
      size: item.size ?? null,
      type: item.type ?? null,
      sub_type_label: item.sub_type_label ?? null,
    } as Record<string, unknown>,
    last_synced_at: now,
  };
}

async function chunkUpsert(rows: NonNullable<ReturnType<typeof mapRow>>[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("inventory_item_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(chunk as any, { onConflict: "item_ref" });
    if (error) throw new Error(error.message);
  }
}

/**
 * Merges UEX catalog rows into Wiki rows with the same name. The Wiki row
 * inherits UEX shops/prices when it lacks them, and the UEX row is marked
 * with `merged_into = <wiki_ref>` so it disappears from listings but stays
 * resolvable for old inventory/warehouse references. Ambiguous name matches
 * (multiple Wiki rows with the same name) are skipped.
 */
async function mergeUexIntoWiki(): Promise<number> {
  const { data: wikiRows } = await supabaseAdmin
    .from("inventory_item_catalog")
    .select("item_ref,name,image_url,description,shops,price_buy,price_sell")
    .eq("source", "wiki")
    .is("merged_into", null);
  if (!wikiRows?.length) return 0;

  const byName = new Map<
    string,
    {
      item_ref: string;
      image_url: string | null;
      description: string | null;
      shops: unknown;
      price_buy: number | null;
      price_sell: number | null;
      count: number;
    }
  >();
  for (const w of wikiRows) {
    const k = String(w.name ?? "").trim().toLowerCase();
    if (!k) continue;
    const prev = byName.get(k);
    if (prev) prev.count++;
    else
      byName.set(k, {
        item_ref: String(w.item_ref),
        image_url: (w.image_url as string | null) ?? null,
        description: (w.description as string | null) ?? null,
        shops: w.shops ?? [],
        price_buy: (w.price_buy as number | null) ?? null,
        price_sell: (w.price_sell as number | null) ?? null,
        count: 1,
      });
  }

  const { data: uexRows } = await supabaseAdmin
    .from("inventory_item_catalog")
    .select("item_ref,name,image_url,shops,price_buy,price_sell,wiki_uuid,source,merged_into")
    .eq("source", "uex")
    .is("merged_into", null);
  if (!uexRows?.length) return 0;

  let merged = 0;
  for (const r of uexRows) {
    const k = String(r.name ?? "").trim().toLowerCase();
    const hit = byName.get(k);
    if (!hit || hit.count > 1) continue;

    // If the Wiki row lacks trade data, copy it over from UEX.
    const wikiHasShops = Array.isArray(hit.shops) && (hit.shops as unknown[]).length > 0;
    const uexShops = r.shops ?? [];
    const uexHasShops = Array.isArray(uexShops) && (uexShops as unknown[]).length > 0;
    const patch: Record<string, unknown> = {};
    if (!wikiHasShops && uexHasShops) patch.shops = uexShops;
    if (hit.price_buy == null && r.price_buy != null) patch.price_buy = r.price_buy;
    if (hit.price_sell == null && r.price_sell != null) patch.price_sell = r.price_sell;
    if (Object.keys(patch).length) {
      await supabaseAdmin
        .from("inventory_item_catalog")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("item_ref", hit.item_ref);
    }

    const { error } = await supabaseAdmin
      .from("inventory_item_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ merged_into: hit.item_ref } as any)
      .eq("item_ref", r.item_ref as string);
    if (!error) merged++;
  }
  return merged;
}

export async function syncWikiItemsAll(): Promise<{
  pages: number;
  scanned: number;
  inserted: number;
  skipped: number;
  backfilled_uex: number;
  duration_ms: number;
}> {
  const started = Date.now();
  const now = new Date().toISOString();
  let page = 1;
  let last = 1;
  let scanned = 0;
  let inserted = 0;
  const batch: NonNullable<ReturnType<typeof mapRow>>[] = [];

  const runIns = await supabaseAdmin
    .from("wiki_sync_runs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ status: "running" } as any)
    .select("id")
    .single();
  const runId = (runIns.data as { id: string } | null)?.id ?? null;

  try {
  do {
    const url = `${WIKI_BASE}/items?limit=200&include=images&page%5Bnumber%5D=${page}`;
    const res = await fetchJson<Paged<WikiItem>>(url);
    last = res.meta?.last_page ?? page;
    for (const item of res.data ?? []) {
      scanned++;
      const row = mapRow(item, now);
      if (row) batch.push(row);
    }
    if (batch.length >= 200) {
      const flush = batch.splice(0, batch.length);
      await chunkUpsert(flush);
      inserted += flush.length;
    }
    page++;
    await new Promise((r) => setTimeout(r, 150));
  } while (page <= last);

  if (batch.length) {
    await chunkUpsert(batch);
    inserted += batch.length;
  }

  const backfilled_uex = await mergeUexIntoWiki();

  const duration_ms = Date.now() - started;
  const result = {
    pages: last,
    scanned,
    inserted,
    skipped: scanned - inserted,
    backfilled_uex,
    duration_ms,
  };
  if (runId) {
    await supabaseAdmin
      .from("wiki_sync_runs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        pages: last,
        scanned,
        inserted,
        skipped: scanned - inserted,
        backfilled_uex,
        duration_ms,
      } as any)
      .eq("id", runId);
  }
  return result;
  } catch (err) {
    if (runId) {
      await supabaseAdmin
        .from("wiki_sync_runs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - started,
          error_message: err instanceof Error ? err.message : String(err),
        } as any)
        .eq("id", runId);
    }
    throw err;
  }
}