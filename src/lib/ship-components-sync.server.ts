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
  price_rent?: number | null;
  terminal_id?: number | null;
  terminal_code?: string | null;
  terminal_name?: string | null;
  starmap_location?: {
    name?: string | null;
    type_name?: string | null;
    parent_name?: string | null;
    star_system_name?: string | null;
  } | null;
  date_updated?: string | null;
  uex_link?: string | null;
};

type WikiVehicleItem = {
  uuid: string;
  slug: string;
  name: string;
  classification: string | null;
  classification_label: string | null;
  description?: Record<string, string> | null;
  size?: number | null;
  grade?: string | null;
  class?: string | null;
  type?: string | null;
  type_label?: string | null;
  sub_type?: string | null;
  sub_type_label?: string | null;
  is_craftable?: boolean | null;
  manufacturer?: {
    name?: string | null;
    code?: string | null;
  } | null;
  images?: Array<{ url?: string | null }> | null;
  shops?: unknown;
  uex_prices?: { purchase?: UexPurchase[] | null } | null;
  web_url?: string | null;
};

export type ComponentShop = {
  terminal_name: string | null;
  terminal_code: string | null;
  location: string | null;
  parent: string | null;
  system: string | null;
  price_buy: number | null;
  price_sell: number | null;
  price_rent: number | null;
  date_updated: string | null;
  uex_link: string | null;
};

/**
 * Classification prefixes we treat as relevant ship components.
 * Everything not on this list (Paints, Flair, Armor, …) is dropped.
 */
const RELEVANT_PREFIXES = [
  "Ship.Weapon",
  "Ship.Turret",
  "Ship.MissileLauncher",
  "Ship.Missile",
  "Ship.WeaponDefensive",
  "Ship.Shield",
  "Ship.PowerPlant",
  "Ship.Cooler",
  "Ship.QuantumDrive",
  "Ship.QuantumFuelIntake",
  "Ship.Thruster",
  "Ship.MainThruster",
  "Ship.Radar",
  "Ship.FlightController",
  "Ship.Scanner",
  "Ship.Ping",
  "Ship.Salvage",
  "Ship.Mining",
  "Ship.Beam",
] as const;

const EXCLUDE_PREFIXES = [
  "Ship.Paints",
  "Ship.Flair",
  "Ship.Armor",
] as const;

export function classifyCategory(classification: string | null | undefined): string | null {
  if (!classification) return null;
  if (EXCLUDE_PREFIXES.some((p) => classification.startsWith(p))) return null;
  if (!RELEVANT_PREFIXES.some((p) => classification.startsWith(p))) return null;

  if (
    classification.startsWith("Ship.Weapon") ||
    classification.startsWith("Ship.Turret")
  ) {
    return "weapons";
  }
  if (
    classification.startsWith("Ship.Missile") ||
    classification.startsWith("Ship.MissileLauncher") ||
    classification.startsWith("Ship.WeaponDefensive")
  ) {
    return "missiles";
  }
  if (
    classification.startsWith("Ship.Thruster") ||
    classification.startsWith("Ship.MainThruster") ||
    classification.startsWith("Ship.QuantumFuelIntake")
  ) {
    return "propulsion";
  }
  if (
    classification.startsWith("Ship.Salvage") ||
    classification.startsWith("Ship.Mining") ||
    classification.startsWith("Ship.Beam")
  ) {
    return "tools";
  }
  return "systems";
}

function mapShops(item: WikiVehicleItem): ComponentShop[] {
  const list = item.uex_prices?.purchase ?? [];
  return list.map((s) => ({
    terminal_name: s.terminal_name ?? null,
    terminal_code: s.terminal_code ?? null,
    location: s.starmap_location?.name ?? null,
    parent: s.starmap_location?.parent_name ?? null,
    system: s.starmap_location?.star_system_name ?? null,
    price_buy: s.price_buy ?? null,
    price_sell: s.price_sell ?? null,
    price_rent: s.price_rent ?? null,
    date_updated: s.date_updated ?? null,
    uex_link: s.uex_link ?? null,
  }));
}

function minBuyPrice(shops: ComponentShop[]): number | null {
  let min: number | null = null;
  for (const s of shops) {
    if (s.price_buy != null && s.price_buy > 0) {
      if (min == null || s.price_buy < min) min = s.price_buy;
    }
  }
  return min;
}

export function mapWikiItemToRow(item: WikiVehicleItem) {
  const category = classifyCategory(item.classification);
  if (!category) return null;
  const shops = mapShops(item);
  return {
    item_ref: `wiki:${item.uuid}`,
    wiki_uuid: item.uuid,
    name: item.name,
    slug: item.slug ?? null,
    manufacturer_name: item.manufacturer?.name ?? null,
    manufacturer_code: item.manufacturer?.code ?? null,
    classification: item.classification ?? null,
    classification_label: item.classification_label ?? null,
    category,
    size: item.size ?? null,
    grade: item.grade ?? null,
    item_class: item.class ?? null,
    type: item.type ?? null,
    type_label: item.type_label ?? null,
    sub_type: item.sub_type ?? null,
    sub_type_label: item.sub_type_label ?? null,
    description: item.description ?? null,
    image_url: item.images?.[0]?.url ?? null,
    web_url: item.web_url ?? null,
    shops,
    min_price_buy: minBuyPrice(shops),
    is_craftable: !!item.is_craftable,
    raw: item as unknown as Record<string, unknown>,
    last_synced_at: new Date().toISOString(),
  };
}

async function chunkUpsert<T extends Record<string, unknown>>(
  rows: T[],
  size = 100,
) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabaseAdmin
      .from("ship_components_catalog")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(chunk as any, { onConflict: "item_ref" });
    if (error) throw new Error(error.message);
  }
}

export async function syncAllShipComponents(): Promise<{
  pages: number;
  scanned: number;
  inserted: number;
  skipped: number;
}> {
  let page = 1;
  let last = 1;
  let scanned = 0;
  let inserted = 0;
  const batch: ReturnType<typeof mapWikiItemToRow>[] = [];

  do {
    const url = `${WIKI_BASE}/vehicle-items?limit=200&page%5Bnumber%5D=${page}`;
    const res = await fetchJson<Paged<WikiVehicleItem>>(url);
    last = res.meta?.last_page ?? page;
    for (const item of res.data ?? []) {
      scanned++;
      const row = mapWikiItemToRow(item);
      if (row) batch.push(row);
    }
    if (batch.length >= 200) {
      const flush = batch.splice(0, batch.length).filter(Boolean) as NonNullable<
        ReturnType<typeof mapWikiItemToRow>
      >[];
      await chunkUpsert(flush);
      inserted += flush.length;
    }
    page++;
  } while (page <= last);

  if (batch.length > 0) {
    const flush = batch.filter(Boolean) as NonNullable<
      ReturnType<typeof mapWikiItemToRow>
    >[];
    await chunkUpsert(flush);
    inserted += flush.length;
  }

  return { pages: last, scanned, inserted, skipped: scanned - inserted };
}

export async function refreshOneShipComponent(wikiUuid: string) {
  const url = `${WIKI_BASE}/items/${encodeURIComponent(wikiUuid)}?include=shops`;
  const res = await fetchJson<{ data: WikiVehicleItem }>(url);
  const row = mapWikiItemToRow(res.data);
  if (!row) throw new Error("Item ist keine bekannte Schiffskomponente.");
  await chunkUpsert([row]);
  return row;
}