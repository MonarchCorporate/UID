import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ============================================================
 * Material-Katalog mit Bezugsquellen (Mining/Shop/Salvage…)
 * ============================================================
 * Datenherkunft: Star-Citizen-Wiki API.
 * Persistenz: Spalten description / acquisition / shops /
 * sources_fetched_at auf inventory_item_catalog.
 */

const WIKI_BASE = "https://api.star-citizen.wiki/api";
const CACHE_MAX_AGE_DAYS = 7;

// In-process cache of the commodity index (uuid + name lookup) for raw/ore fallback.
let commodityIndexPromise: Promise<Array<{ uuid: string; name: string; display_name: string }>> | null = null;
async function getCommodityIndex() {
  if (!commodityIndexPromise) {
    commodityIndexPromise = (async () => {
      const out: Array<{ uuid: string; name: string; display_name: string }> = [];
      for (let page = 1; page <= 5; page++) {
        const res = await fetchJson<{ data?: Array<Record<string, unknown>>; meta?: { last_page?: number } }>(
          `${WIKI_BASE}/commodities?limit=300&page=${page}`,
        );
        const data = res?.data ?? [];
        for (const c of data) {
          out.push({
            uuid: (c.uuid as string) ?? "",
            name: (c.name as string) ?? "",
            display_name: (c.display_name as string) ?? "",
          });
        }
        const last = res?.meta?.last_page;
        if (!data.length || (last && page >= last)) break;
      }
      return out;
    })();
  }
  return commodityIndexPromise;
}

async function findRawCommodityByName(name: string): Promise<string | null> {
  const idx = await getCommodityIndex();
  const n = name.toLowerCase().trim();
  const candidates = [
    `${n} (ore)`,
    `raw ${n}`,
    `${n} (mineral)`,
    `${n} (pure)`,
    `raw ${n} (nonmetal)`,
  ];
  for (const cand of candidates) {
    const hit = idx.find(
      (c) =>
        c.display_name.toLowerCase().startsWith(cand) ||
        c.name.toLowerCase() === cand,
    );
    if (hit) return hit.uuid;
  }
  return null;
}

export type Acquisition = {
  mineable: boolean;
  mineable_ship: boolean;
  mineable_ground: boolean;
  mineable_fps: boolean;
  harvestable: boolean;
  salvage: boolean;
  shop: boolean;
  methods: string[];
  locations?: LocationEntry[];
};

export type LocationEntry = {
  name: string;
  display_name?: string | null;
  type?: string | null;
  system?: string | null;
  parent_name?: string | null;
  parent_type?: string | null;
  group_probability_percent?: number | null;
  relative_probability_percent?: number | null;
};

export type ShopEntry = {
  terminal_name: string | null;
  location: string | null;
  parent: string | null;
  system: string | null;
  price_buy: number | null;
  price_sell: number | null;
  date_updated: string | null;
  uex_link: string | null;
};

export type MaterialListItem = {
  item_ref: string;
  name: string;
  kind: string | null;
  unit: string | null;
  image_url: string | null;
  wiki_uuid: string | null;
  acquisition: Acquisition | null;
  used_in_count: number;
};

export type MaterialDetail = {
  item_ref: string;
  name: string;
  kind: string | null;
  unit: string | null;
  image_url: string | null;
  wiki_uuid: string | null;
  description: string | null;
  acquisition: Acquisition | null;
  shops: ShopEntry[];
  used_in: Array<{ blueprint_id: string; item_name: string; qty: number; unit: string | null }>;
  sources_fetched_at: string | null;
  source_url: string | null;
};

function emptyAcquisition(): Acquisition {
  return {
    mineable: false,
    mineable_ship: false,
    mineable_ground: false,
    mineable_fps: false,
    harvestable: false,
    salvage: false,
    shop: false,
    methods: [],
  };
}

function wikiUuidFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return ref.startsWith("wiki:") ? ref.slice(5) : null;
}

async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type UexPurchase = {
  price_buy?: number | null;
  price_sell?: number | null;
  terminal_name?: string | null;
  date_updated?: string | null;
  uex_link?: string | null;
  starmap_location?: {
    name?: string | null;
    parent_name?: string | null;
    star_system_name?: string | null;
  } | null;
};

type UexPrices = { purchase?: UexPurchase[] | null } | null;

type WikiCommodityData = {
  uuid?: string;
  name?: string;
  description?: string | null;
  is_mineable?: boolean;
  has_ship_mineables?: boolean;
  has_ground_vehicle_mineables?: boolean;
  has_fps_mineables?: boolean;
  has_harvestables?: boolean;
  has_salvage?: boolean;
  methods?: Array<{ name?: string } | string> | null;
  images?: Array<{ thumbnail_url?: string; original_url?: string }> | null;
  web_url?: string | null;
  uex_prices?: UexPrices;
  locations?: Array<Record<string, unknown>> | null;
  systems?: string[] | null;
  raw_versions?: Array<{ uuid?: string }> | null;
};

type WikiCommodity = { data?: WikiCommodityData };

type WikiItem = {
  data?: {
    uuid?: string;
    name?: string;
    description?: string | null;
    images?: Array<{ thumbnail_url?: string; original_url?: string }> | null;
    web_url?: string | null;
    uex_prices?: UexPrices;
    resource_container?: {
      default_composition?: Array<{
        commodity?: { uuid?: string } | null;
      }> | null;
    } | null;
  };
};

function mapShops(prices: UexPrices): ShopEntry[] {
  const list = prices?.purchase ?? [];
  return list.map((p: UexPurchase) => ({
    terminal_name: p.terminal_name ?? null,
    location: p.starmap_location?.name ?? null,
    parent: p.starmap_location?.parent_name ?? null,
    system: p.starmap_location?.star_system_name ?? null,
    price_buy: typeof p.price_buy === "number" ? p.price_buy : null,
    price_sell: typeof p.price_sell === "number" ? p.price_sell : null,
    date_updated: p.date_updated ?? null,
    uex_link: p.uex_link ?? null,
  }));
}

function mapAcquisition(
  c: WikiCommodityData | undefined,
  shops: ShopEntry[],
): Acquisition {
  const methods = (c?.methods ?? [])
    .map((m) => (typeof m === "string" ? m : m?.name ?? ""))
    .filter((s): s is string => !!s);
  const ship = !!c?.has_ship_mineables;
  const ground = !!c?.has_ground_vehicle_mineables;
  const fps = !!c?.has_fps_mineables;
  const locations: LocationEntry[] = (c?.locations ?? []).map((l) => {
    const r = l as Record<string, unknown>;
    return {
      name: (r.name as string) ?? "",
      display_name: (r.display_name as string | null) ?? null,
      type: (r.type as string | null) ?? null,
      system: (r.system as string | null) ?? null,
      parent_name: (r.parent_name as string | null) ?? null,
      parent_type: (r.parent_type as string | null) ?? null,
      group_probability_percent:
        typeof r.group_probability_percent === "number"
          ? (r.group_probability_percent as number)
          : null,
      relative_probability_percent:
        typeof r.relative_probability_percent === "number"
          ? (r.relative_probability_percent as number)
          : null,
    };
  }).filter((l) => !!l.name);
  return {
    mineable: !!c?.is_mineable || ship || ground || fps,
    mineable_ship: ship,
    mineable_ground: ground,
    mineable_fps: fps,
    harvestable: !!c?.has_harvestables,
    salvage: !!c?.has_salvage,
    shop: shops.length > 0,
    methods,
    locations,
  };
}

async function refreshWikiCache(
  catalogRow: Record<string, unknown>,
): Promise<{
  description: string | null;
  acquisition: Acquisition;
  shops: ShopEntry[];
  image_url: string | null;
}> {
  const uuid =
    (catalogRow.wiki_uuid as string | null) ??
    wikiUuidFromRef(catalogRow.item_ref as string | null);
  if (!uuid) {
    return {
      description: (catalogRow.description as string | null) ?? null,
      acquisition: emptyAcquisition(),
      shops: [],
      image_url: (catalogRow.image_url as string | null) ?? null,
    };
  }

  // Try commodity first, fall back to item endpoint.
  let commodity = await fetchJson<WikiCommodity>(
    `${WIKI_BASE}/commodities/${uuid}`,
  );
  let itemData: WikiItem["data"] | null = null;
  if (!commodity?.data) {
    const item = await fetchJson<WikiItem>(`${WIKI_BASE}/items/${uuid}`);
    itemData = item?.data ?? null;
    // Follow default_composition → commodity UUID for richer data (locations, etc.)
    const compUuid =
      itemData?.resource_container?.default_composition?.[0]?.commodity?.uuid;
    if (compUuid) {
      const comp = await fetchJson<WikiCommodity>(
        `${WIKI_BASE}/commodities/${compUuid}`,
      );
      if (comp?.data) commodity = comp;
    }
    if (!commodity?.data && itemData) {
      commodity = {
        data: {
          uuid: itemData.uuid,
          name: itemData.name,
          description:
            typeof itemData.description === "string"
              ? itemData.description
              : null,
          images: itemData.images,
          web_url: itemData.web_url,
          uex_prices: itemData.uex_prices ?? null,
        },
      };
    }
  }

  const data = commodity?.data ?? {};

  // If the primary commodity has no mining data, follow raw_versions[0] (e.g. refined → raw).
  let rawData: WikiCommodityData | null = null;
  const noMining =
    !data.is_mineable &&
    !data.has_ship_mineables &&
    !data.has_ground_vehicle_mineables &&
    !data.has_fps_mineables &&
    !data.has_harvestables &&
    !(data.locations && data.locations.length > 0);
  const rawUuid = data.raw_versions?.[0]?.uuid;
  if (noMining && rawUuid) {
    const raw = await fetchJson<WikiCommodity>(
      `${WIKI_BASE}/commodities/${rawUuid}`,
    );
    if (raw?.data) rawData = raw.data;
  }

  // Name-based fallback for materials whose raw_versions[] isn't linked
  // (e.g. Iron → "Iron (Ore)", Silicon → "Raw Silicon").
  const stillNoLocations =
    !rawData &&
    !(data.locations && data.locations.length > 0) &&
    !data.has_ship_mineables &&
    !data.has_ground_vehicle_mineables &&
    !data.has_fps_mineables;
  if (stillNoLocations && data.name) {
    const altUuid = await findRawCommodityByName(data.name);
    if (altUuid && altUuid !== data.uuid) {
      const alt = await fetchJson<WikiCommodity>(
        `${WIKI_BASE}/commodities/${altUuid}`,
      );
      if (alt?.data) rawData = alt.data;
    }
  }

  const miningSource: WikiCommodityData = rawData ?? data;
  const shops = mapShops(data.uex_prices ?? null);
  const acquisition = mapAcquisition(miningSource, shops);
  const description =
    (typeof data.description === "string" ? data.description : null) ??
    (typeof itemData?.description === "string" ? itemData.description : null) ??
    null;
  const image_url =
    data.images?.[0]?.thumbnail_url ??
    data.images?.[0]?.original_url ??
    itemData?.images?.[0]?.thumbnail_url ??
    itemData?.images?.[0]?.original_url ??
    (catalogRow.image_url as string | null) ??
    null;

  await supabaseAdmin
    .from("inventory_item_catalog")
    .update({
      description,
      acquisition: acquisition as unknown as never,
      shops: shops as unknown as never,
      image_url,
      sources_fetched_at: new Date().toISOString(),
    })
    .eq("item_ref", catalogRow.item_ref as string);

  return { description, acquisition, shops, image_url };
}

function isCacheFresh(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/* ============================================================
 * listMaterials
 * ============================================================ */
export const listMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // 1) distinct components from blueprints
    const { data: comps, error } = await supabaseAdmin
      .from("blueprint_components")
      .select("item_ref,item_name,unit,kind,external_uuid,blueprint_id");
    if (error) throw new Error(error.message);

    type Agg = {
      item_ref: string | null;
      item_name: string;
      kind: string | null;
      unit: string | null;
      external_uuid: string | null;
      bpIds: Set<string>;
    };
    const byKey = new Map<string, Agg>();
    for (const c of comps ?? []) {
      const key =
        (c.item_ref as string | null) ??
        (c.external_uuid ? `wiki:${c.external_uuid}` : null) ??
        `name:${(c.item_name as string).toLowerCase()}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.bpIds.add(c.blueprint_id as string);
      } else {
        byKey.set(key, {
          item_ref: (c.item_ref as string | null) ?? null,
          item_name: c.item_name as string,
          kind: (c.kind as string | null) ?? null,
          unit: (c.unit as string | null) ?? null,
          external_uuid: (c.external_uuid as string | null) ?? null,
          bpIds: new Set([c.blueprint_id as string]),
        });
      }
    }

    // 2) Resolve identity to catalog entries
    const refs = Array.from(byKey.values())
      .map((a) => a.item_ref)
      .filter((r): r is string => !!r);
    const uuids = Array.from(byKey.values())
      .map((a) => a.external_uuid)
      .filter((u): u is string => !!u);
    const names = Array.from(byKey.values()).map((a) => a.item_name);

    const catalogByRef = new Map<string, Record<string, unknown>>();
    const catalogByUuid = new Map<string, Record<string, unknown>>();
    const catalogByName = new Map<string, Record<string, unknown>>();

    if (refs.length > 0) {
      const { data } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select(
          "item_ref,name,kind,unit,image_url,wiki_uuid,acquisition,sources_fetched_at",
        )
        .in("item_ref", refs);
      for (const r of data ?? [])
        catalogByRef.set(r.item_ref as string, r as Record<string, unknown>);
    }
    if (uuids.length > 0) {
      const { data } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select(
          "item_ref,name,kind,unit,image_url,wiki_uuid,acquisition,sources_fetched_at",
        )
        .in("wiki_uuid", uuids);
      for (const r of data ?? [])
        catalogByUuid.set(r.wiki_uuid as string, r as Record<string, unknown>);
    }
    if (names.length > 0) {
      const { data } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select(
          "item_ref,name,kind,unit,image_url,wiki_uuid,acquisition,sources_fetched_at",
        )
        .in("name", names);
      // Prefer the row with the richest data (wiki_uuid + sources_fetched_at + acquisition)
      // when multiple catalog entries share a name (e.g. UEX "commodity:44" vs the
      // populated "5918" wiki-linked row for Iron).
      const score = (r: Record<string, unknown>) =>
        (r.wiki_uuid ? 4 : 0) +
        (r.sources_fetched_at ? 2 : 0) +
        (r.acquisition ? 1 : 0);
      for (const r of data ?? []) {
        const key = (r.name as string).toLowerCase();
        const prev = catalogByName.get(key);
        if (!prev || score(r as Record<string, unknown>) > score(prev)) {
          catalogByName.set(key, r as Record<string, unknown>);
        }
      }
    }

    const out: MaterialListItem[] = [];
    for (const agg of byKey.values()) {
      // Collect all candidate catalog rows for this material and pick the
      // richest one (so Iron resolves to the populated "5918" row instead of
      // the empty "commodity:44" dupe).
      const score = (r: Record<string, unknown>) =>
        (r.wiki_uuid ? 4 : 0) +
        (r.sources_fetched_at ? 2 : 0) +
        (r.acquisition ? 1 : 0);
      const candidates: Array<Record<string, unknown>> = [];
      if (agg.item_ref) {
        const c = catalogByRef.get(agg.item_ref);
        if (c) candidates.push(c);
      }
      if (agg.external_uuid) {
        const c = catalogByUuid.get(agg.external_uuid);
        if (c) candidates.push(c);
      }
      const byName = catalogByName.get(agg.item_name.toLowerCase());
      if (byName) candidates.push(byName);
      const cat =
        candidates.length === 0
          ? null
          : candidates.reduce((best, r) => (score(r) > score(best) ? r : best));
      // Prefer the catalog row's ref when it scores higher than the blueprint
      // ref — that way navigation lands on the populated entry.
      const blueprintRefScore = agg.item_ref
        ? score(catalogByRef.get(agg.item_ref) ?? {})
        : -1;
      const catRef = (cat?.item_ref as string | undefined) ?? null;
      const useCatRef =
        catRef && cat && score(cat) > blueprintRefScore ? catRef : null;
      const effectiveRef =
        useCatRef ??
        agg.item_ref ??
        catRef ??
        (agg.external_uuid ? `wiki:${agg.external_uuid}` : `name:${agg.item_name}`);
      out.push({
        item_ref: effectiveRef,
        name: agg.item_name,
        kind: agg.kind ?? ((cat?.kind as string | null) ?? null),
        unit: agg.unit ?? ((cat?.unit as string | null) ?? null),
        image_url: (cat?.image_url as string | null) ?? null,
        wiki_uuid:
          (cat?.wiki_uuid as string | null) ?? agg.external_uuid ?? null,
        acquisition: (cat?.acquisition as Acquisition | null) ?? null,
        used_in_count: agg.bpIds.size,
      });
    }
    // 3) Auch reine Mining-/Harvest-/Salvage-Rohstoffe aus dem Katalog
    //    einblenden, selbst wenn sie in keinem Blueprint als Zutat
    //    verwendet werden (z. B. Jaclium).
    const seenRefs = new Set(out.map((o) => o.item_ref));
    const seenNames = new Set(out.map((o) => o.name.toLowerCase()));
    const seenUuids = new Set(
      out.map((o) => o.wiki_uuid).filter((u): u is string => !!u),
    );

    const { data: extraCatalog } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select(
        "item_ref,name,kind,unit,image_url,wiki_uuid,acquisition,sources_fetched_at,source",
      )
      .eq("source", "wiki")
      .not("wiki_uuid", "is", null);
    for (const r of extraCatalog ?? []) {
      const rr = r as Record<string, unknown>;
      const ref = rr.item_ref as string;
      const name = (rr.name as string) ?? "";
      const uuid = rr.wiki_uuid as string | null;
      if (seenRefs.has(ref)) continue;
      if (uuid && seenUuids.has(uuid)) continue;
      if (name && seenNames.has(name.toLowerCase())) continue;
      const acq = rr.acquisition as Acquisition | null;
      const isRelevant =
        !!acq &&
        (acq.mineable || acq.harvestable || acq.salvage);
      if (!isRelevant) continue;
      out.push({
        item_ref: ref,
        name,
        kind: (rr.kind as string | null) ?? null,
        unit: (rr.unit as string | null) ?? null,
        image_url: (rr.image_url as string | null) ?? null,
        wiki_uuid: uuid,
        acquisition: acq,
        used_in_count: 0,
      });
    }

    out.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return out;
  });

/* ============================================================
 * getMaterialDetail
 * ============================================================ */
export const getMaterialDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        item_ref: z.string().min(1).max(255),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const ref = data.item_ref;

    // Resolve catalog row by ref → wiki_uuid → name
    let cat: Record<string, unknown> | null = null;
    {
      const { data: r1 } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select("*")
        .eq("item_ref", ref)
        .maybeSingle();
      cat = (r1 as Record<string, unknown> | null) ?? null;
    }
    if (!cat) {
      const uuid = wikiUuidFromRef(ref);
      if (uuid) {
        const { data: r2 } = await supabaseAdmin
          .from("inventory_item_catalog")
          .select("*")
          .eq("wiki_uuid", uuid)
          .maybeSingle();
        cat = (r2 as Record<string, unknown> | null) ?? null;
      }
    }
    if (!cat && ref.startsWith("name:")) {
      const nm = ref.slice(5);
      const { data: r3 } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select("*")
        .ilike("name", nm)
        .limit(1)
        .maybeSingle();
      cat = (r3 as Record<string, unknown> | null) ?? null;
    }

    // If the resolved catalog row has no wiki_uuid (e.g. an empty UEX dupe
    // like "commodity:44" for Iron), look up sibling rows by name and prefer
    // the one with wiki_uuid / sources_fetched_at populated.
    if (cat && !cat.wiki_uuid) {
      const name = cat.name as string | null;
      if (name) {
        const { data: siblings } = await supabaseAdmin
          .from("inventory_item_catalog")
          .select("*")
          .ilike("name", name);
        const score = (r: Record<string, unknown>) =>
          (r.wiki_uuid ? 4 : 0) +
          (r.sources_fetched_at ? 2 : 0) +
          (r.acquisition ? 1 : 0);
        const best = (siblings ?? []).reduce<Record<string, unknown> | null>(
          (b, r) =>
            !b || score(r as Record<string, unknown>) > score(b)
              ? (r as Record<string, unknown>)
              : b,
          null,
        );
        if (best && score(best) > score(cat)) cat = best;
      }
    }

    // Fallback: get name/kind via blueprint_components when no catalog row
    let displayName: string;
    let displayKind: string | null = null;
    let displayUnit: string | null = null;
    let wikiUuid: string | null = null;

    if (cat) {
      displayName = (cat.name as string) ?? "—";
      displayKind = (cat.kind as string | null) ?? null;
      displayUnit = (cat.unit as string | null) ?? null;
      wikiUuid =
        (cat.wiki_uuid as string | null) ??
        wikiUuidFromRef((cat.item_ref as string | null) ?? null);
    } else {
      const uuid = wikiUuidFromRef(ref);
      type Bpc = { item_name: string; kind: string | null; unit: string | null; external_uuid: string | null };
      let bpc: Bpc | null = null;
      if (ref.startsWith("name:")) {
        const nm = ref.slice(5);
        const { data } = await supabaseAdmin
          .from("blueprint_components")
          .select("item_name,kind,unit,external_uuid")
          .ilike("item_name", nm)
          .limit(1)
          .maybeSingle();
        bpc = (data as Bpc | null) ?? null;
      } else {
        const orParts = [`item_ref.eq.${ref}`];
        if (uuid) orParts.push(`external_uuid.eq.${uuid}`);
        const { data } = await supabaseAdmin
          .from("blueprint_components")
          .select("item_name,kind,unit,external_uuid")
          .or(orParts.join(","))
          .limit(1)
          .maybeSingle();
        bpc = (data as Bpc | null) ?? null;
      }
      if (!bpc) throw new Error("Material nicht gefunden.");
      displayName = bpc.item_name as string;
      displayKind = (bpc.kind as string | null) ?? null;
      displayUnit = (bpc.unit as string | null) ?? null;
      wikiUuid = uuid ?? ((bpc.external_uuid as string | null) ?? null);

      // If we still have no wiki uuid, try the commodity index by name so raw
      // materials (Iron, Tungsten, Copper …) also resolve to a wiki entry.
      if (!wikiUuid && displayName) {
        const hit = await findRawCommodityByName(displayName);
        if (hit) wikiUuid = hit;
        if (!wikiUuid) {
          const idx = await getCommodityIndex();
          const n = displayName.toLowerCase().trim();
          const match = idx.find(
            (c) =>
              c.name.toLowerCase() === n ||
              c.display_name.toLowerCase() === n ||
              c.display_name.toLowerCase().startsWith(n + " ("),
          );
          if (match?.uuid) wikiUuid = match.uuid;
        }
      }

      // Create a catalog row on-the-fly so we can persist wiki data and hit
      // the cache on the next visit.
      if (wikiUuid) {
        const wikiRef = `wiki:${wikiUuid}`;
        const { data: inserted } = await supabaseAdmin
          .from("inventory_item_catalog")
          .upsert(
            {
              item_ref: wikiRef,
              name: displayName,
              kind: displayKind,
              unit:
                (displayUnit ?? "").toLowerCase() === "scu" ? "scu" : "pcs",
              wiki_uuid: wikiUuid,
              source: "wiki",
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "item_ref" },
          )
          .select("*")
          .maybeSingle();
        if (inserted) cat = inserted as Record<string, unknown>;
      }
    }

    // Refresh wiki cache when stale (only when we have a catalog row to update)
    let description: string | null =
      (cat?.description as string | null) ?? null;
    let acquisition: Acquisition | null =
      (cat?.acquisition as Acquisition | null) ?? null;
    let shops: ShopEntry[] = (cat?.shops as ShopEntry[] | null) ?? [];
    let image_url: string | null = (cat?.image_url as string | null) ?? null;
    const fetchedAt = (cat?.sources_fetched_at as string | null) ?? null;

    const needsLocationBackfill =
      !!acquisition &&
      (acquisition.mineable || acquisition.harvestable) &&
      !(acquisition.locations && acquisition.locations.length > 0);
    // Nur synchron nachladen, wenn wir noch KEINE Daten im Cache haben –
    // sonst blockiert die Wiki-API die Detailseite und der User sieht nur
    // "Lade Material…". Aktualisierungen laufen im Hintergrund via Cron
    // (`refreshAllMaterialSources`).
    const hasCached = !!description || !!image_url || shops.length > 0 ||
      (acquisition && (acquisition.methods?.length || acquisition.locations?.length));
    if (cat && wikiUuid && !hasCached) {
      try {
        const refreshed = await Promise.race([
          refreshWikiCache(cat),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        if (refreshed) {
          description = refreshed.description ?? description;
          acquisition = refreshed.acquisition;
          shops = refreshed.shops;
          image_url = refreshed.image_url ?? image_url;
        }
      } catch {
        // Wiki nicht erreichbar – Detailseite trotzdem mit dem ausliefern,
        // was wir schon wissen.
      }
    } else if (cat && wikiUuid && (!isCacheFresh(fetchedAt) || needsLocationBackfill)) {
      // Cache vorhanden aber veraltet: im Hintergrund aktualisieren,
      // Response nicht blockieren.
      void refreshWikiCache(cat).catch(() => {});
    }

    // Used-in: blueprint usage list
    const orParts = [`item_ref.eq.${ref}`];
    if (wikiUuid) orParts.push(`external_uuid.eq.${wikiUuid}`);
    const { data: usageRows } = await supabaseAdmin
      .from("blueprint_components")
      .select("blueprint_id,qty,unit,slot_label,blueprint:blueprints(id,item_name,source_url,notes)")
      .or(orParts.join(","));

    // Fallback name match if no rows
    let usage = usageRows ?? [];
    if (usage.length === 0 && displayName) {
      const { data: byName } = await supabaseAdmin
        .from("blueprint_components")
        .select("blueprint_id,qty,unit,slot_label,blueprint:blueprints(id,item_name,source_url,notes)")
        .ilike("item_name", displayName);
      usage = byName ?? [];
    }

    // Aggregate per blueprint: sum qty across slots (Riccite can appear in
    // multiple slots of the same blueprint, e.g. Shell + Stator Cores) and
    // disambiguate blueprints that share the same display name (Wiki hat teils
    // Varianten wie `main-powerplant` und `main-powerplant-2`).
    const perBp = new Map<
      string,
      {
        blueprint_id: string;
        item_name: string;
        source_url: string | null;
        notes: string | null;
        qty: number;
        unit: string | null;
      }
    >();
    for (const u of usage) {
      const row = u as Record<string, unknown>;
      const bp = row.blueprint as
        | { id?: string; item_name?: string; source_url?: string | null; notes?: string | null }
        | null;
      const id = (bp?.id as string) ?? (row.blueprint_id as string);
      if (!id) continue;
      const prev = perBp.get(id);
      const qty = Number(row.qty ?? 0);
      const unit = (row.unit as string | null) ?? null;
      if (prev) {
        prev.qty += qty;
        if (!prev.unit && unit) prev.unit = unit;
      } else {
        perBp.set(id, {
          blueprint_id: id,
          item_name: (bp?.item_name as string) ?? "—",
          source_url: (bp?.source_url as string | null) ?? null,
          notes: (bp?.notes as string | null) ?? null,
          qty,
          unit,
        });
      }
    }
    // Disambiguate duplicate names.
    type PerBpEntry = {
      blueprint_id: string;
      item_name: string;
      source_url: string | null;
      notes: string | null;
      qty: number;
      unit: string | null;
    };
    const nameGroups = new Map<string, PerBpEntry[]>();
    for (const v of perBp.values()) {
      const arr = nameGroups.get(v.item_name) ?? [];
      arr.push(v);
      nameGroups.set(v.item_name, arr);
    }
    for (const [, arr] of nameGroups) {
      if (arr.length <= 1) continue;
      arr.sort((a, b) => (a.source_url ?? "").localeCompare(b.source_url ?? ""));
      arr.forEach((v, i) => {
        // Try to extract a variant hint from the source URL slug tail.
        const slug = v.source_url?.split("/").pop() ?? "";
        const m = slug.match(/-(\d+)$/);
        const variant = m ? m[1] : String(i + 1);
        v.item_name = `${v.item_name} (Variante ${variant})`;
      });
    }
    const used_in = Array.from(perBp.values())
      .map((v) => ({
        blueprint_id: v.blueprint_id,
        item_name: v.item_name,
        qty: Math.round(v.qty * 100) / 100,
        unit: v.unit,
      }))
      .sort((a, b) => a.item_name.localeCompare(b.item_name, "de"));

    const detail: MaterialDetail = {
      item_ref: ref,
      name: displayName,
      kind: displayKind,
      unit: displayUnit,
      image_url,
      wiki_uuid: wikiUuid,
      description,
      acquisition: acquisition ?? emptyAcquisition(),
      shops,
      used_in,
      sources_fetched_at: fetchedAt,
      source_url: wikiUuid
        ? `https://starcitizen.tools/${encodeURIComponent(displayName)}`
        : null,
    };
    return detail;
  });

/* ============================================================
 * refreshAllMaterialSources
 * ============================================================
 * Iteriert über alle distincten Materialien aus blueprint_components,
 * stellt einen wiki-basierten Katalog-Eintrag sicher und füllt die
 * Bezugsquellen (Mining/Harvest/Salvage/Shops) per Wiki-API.
 */
export const refreshAllMaterialSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: comps, error } = await supabaseAdmin
      .from("blueprint_components")
      .select("item_name,kind,unit,external_uuid,item_ref");
    if (error) throw new Error(error.message);

    type Mat = {
      name: string;
      kind: string | null;
      unit: string | null;
      external_uuid: string | null;
      item_ref: string | null;
    };
    const byKey = new Map<string, Mat>();
    for (const c of comps ?? []) {
      const key =
        (c.external_uuid as string | null) ??
        (c.item_ref as string | null) ??
        (c.item_name as string).toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: c.item_name as string,
          kind: (c.kind as string | null) ?? null,
          unit: (c.unit as string | null) ?? null,
          external_uuid: (c.external_uuid as string | null) ?? null,
          item_ref: (c.item_ref as string | null) ?? null,
        });
      }
    }

    const mats = Array.from(byKey.values());
    let processed = 0;
    let refreshed = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in small parallel batches to be gentle on the wiki API.
    const CONCURRENCY = 4;
    for (let i = 0; i < mats.length; i += CONCURRENCY) {
      const slice = mats.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (m) => {
          processed++;
          try {
            // Resolve wiki uuid: from blueprint OR commodity index by name.
            let uuid =
              m.external_uuid ?? wikiUuidFromRef(m.item_ref) ?? null;
            if (!uuid) {
              const idx = await getCommodityIndex();
              const n = m.name.toLowerCase().trim();
              const hit = idx.find(
                (c) =>
                  c.name.toLowerCase() === n ||
                  c.display_name.toLowerCase() === n ||
                  c.display_name.toLowerCase().startsWith(n + " ("),
              );
              if (hit?.uuid) uuid = hit.uuid;
            }
            if (!uuid) {
              skipped++;
              return;
            }

            // Ensure a catalog row exists for this wiki uuid (keyed by wiki:UUID).
            const wikiRef = `wiki:${uuid}`;
            const { data: existing } = await supabaseAdmin
              .from("inventory_item_catalog")
              .select("*")
              .or(`item_ref.eq.${wikiRef},wiki_uuid.eq.${uuid}`)
              .limit(1)
              .maybeSingle();

            let catalogRow = existing as Record<string, unknown> | null;
            if (!catalogRow) {
              const { data: inserted, error: insErr } = await supabaseAdmin
                .from("inventory_item_catalog")
                .upsert(
                  {
                    item_ref: wikiRef,
                    name: m.name,
                    kind: m.kind,
                    unit:
                      (m.unit ?? "").toLowerCase() === "scu" ? "scu" : "pcs",
                    wiki_uuid: uuid,
                    source: "wiki",
                    last_synced_at: new Date().toISOString(),
                  },
                  { onConflict: "item_ref" },
                )
                .select("*")
                .maybeSingle();
              if (insErr) throw new Error(insErr.message);
              catalogRow = inserted as Record<string, unknown> | null;
            } else if (!catalogRow.wiki_uuid) {
              await supabaseAdmin
                .from("inventory_item_catalog")
                .update({ wiki_uuid: uuid })
                .eq("item_ref", catalogRow.item_ref as string);
              catalogRow = { ...catalogRow, wiki_uuid: uuid };
            }

            if (catalogRow) {
              await refreshWikiCache(catalogRow);
              refreshed++;
            }
          } catch (e) {
            errors.push(`${m.name}: ${(e as Error).message}`);
          }
        }),
      );
    }

    return {
      total: mats.length,
      processed,
      refreshed,
      skipped,
      errors: errors.slice(0, 10),
    };
  });

/* ============================================================
 * syncMineableCommodities
 * ============================================================
 * Zieht alle als abbaubar markierten Commodities aus der Wiki-API
 * (Erze, Gase, Harvestables, Salvage) in `inventory_item_catalog`,
 * auch wenn sie in keinem Blueprint als Zutat verwendet werden.
 * Damit tauchen reine Mining-Rohstoffe wie Jaclium in /materialien auf.
 */
export const syncMineableCommodities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // 1) Vollständigen Commodity-Index paginieren.
    type IdxRow = {
      uuid?: string;
      name?: string;
      display_name?: string;
      kind?: string | null;
      is_mineable?: boolean;
      has_ship_mineables?: boolean;
      has_ground_vehicle_mineables?: boolean;
      has_fps_mineables?: boolean;
      has_harvestables?: boolean;
      has_salvage?: boolean;
    };
    const all: IdxRow[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetchJson<{
        data?: IdxRow[];
        meta?: { last_page?: number };
      }>(`${WIKI_BASE}/commodities?limit=300&page=${page}`);
      const data = res?.data ?? [];
      all.push(...data);
      const last = res?.meta?.last_page;
      if (!data.length || (last && page >= last)) break;
    }

    // 2) Kandidaten filtern: alles, was irgendeine Bezugsart abseits
    //    reiner Shop-Ware hat, oder als "raw"-Kind markiert ist.
    const candidates = all.filter((c) => {
      const kind = (c.kind ?? "").toLowerCase();
      return (
        !!c.is_mineable ||
        !!c.has_ship_mineables ||
        !!c.has_ground_vehicle_mineables ||
        !!c.has_fps_mineables ||
        !!c.has_harvestables ||
        !!c.has_salvage ||
        kind === "raw" ||
        kind === "ore" ||
        kind === "gas"
      );
    });

    let processed = 0;
    let created = 0;
    let refreshed = 0;
    const errors: string[] = [];

    const CONCURRENCY = 4;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const slice = candidates.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (c) => {
          processed++;
          const uuid = c.uuid;
          if (!uuid) return;
          const name = c.display_name || c.name || "";
          if (!name) return;
          const wikiRef = `wiki:${uuid}`;
          try {
            const { data: existing } = await supabaseAdmin
              .from("inventory_item_catalog")
              .select("*")
              .or(`item_ref.eq.${wikiRef},wiki_uuid.eq.${uuid}`)
              .limit(1)
              .maybeSingle();

            let row = existing as Record<string, unknown> | null;
            if (!row) {
              const { data: inserted, error: insErr } = await supabaseAdmin
                .from("inventory_item_catalog")
                .upsert(
                  {
                    item_ref: wikiRef,
                    name,
                    kind: (c.kind as string | null) ?? "raw",
                    unit: "scu",
                    wiki_uuid: uuid,
                    source: "wiki",
                    last_synced_at: new Date().toISOString(),
                  },
                  { onConflict: "item_ref" },
                )
                .select("*")
                .maybeSingle();
              if (insErr) throw new Error(insErr.message);
              row = inserted as Record<string, unknown> | null;
              if (row) created++;
            } else if (!row.wiki_uuid) {
              await supabaseAdmin
                .from("inventory_item_catalog")
                .update({ wiki_uuid: uuid })
                .eq("item_ref", row.item_ref as string);
              row = { ...row, wiki_uuid: uuid };
            }

            if (row) {
              await refreshWikiCache(row);
              refreshed++;
            }
          } catch (e) {
            errors.push(`${name}: ${(e as Error).message}`);
          }
        }),
      );
    }

    return {
      total: candidates.length,
      processed,
      created,
      refreshed,
      errors: errors.slice(0, 10),
    };
  });