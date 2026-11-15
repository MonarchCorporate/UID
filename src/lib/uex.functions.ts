import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * UEX Corp API v2 wrapper. Public GET endpoints don't require an API key,
 * so we skip auth entirely and rely on a short in-memory cache to avoid
 * spamming their servers when several viewers open the page at once.
 */
const UEX_BASE = "https://api.uexcorp.space/2.0";
const TTL_MS = 60_000;

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

async function uexGet<T>(path: string): Promise<T> {
  const key = path;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const res = await fetch(`${UEX_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`UEX ${path} failed: ${res.status}`);
  const json = (await res.json()) as { status: string; data: T; message?: string };
  if (json.status !== "ok") throw new Error(json.message || `UEX status ${json.status}`);
  cache.set(key, { at: Date.now(), data: json.data });
  return json.data;
}

export type UexCommodity = {
  id: number;
  name: string;
  code: string;
  kind: string | null;
  slug?: string;
  weight_scu: number | null;
  price_buy: number;
  price_sell: number;
  is_available: number;
  is_buyable: number;
  is_sellable: number;
  is_illegal: number;
  is_mineral: number;
  is_raw: number;
  is_refined: number;
};

export type UexTerminal = {
  id: number;
  id_star_system: number;
  id_planet: number;
  id_moon: number;
  id_city: number;
  id_outpost: number;
  id_space_station: number;
  name: string;
  nickname: string | null;
  code: string | null;
  star_system_name?: string | null;
  planet_name?: string | null;
  orbit_name?: string | null;
  moon_name?: string | null;
  city_name?: string | null;
  outpost_name?: string | null;
  space_station_name?: string | null;
  is_available: number;
};

export type UexPriceRow = {
  id: number;
  id_commodity: number;
  id_terminal: number;
  price_buy: number;
  price_buy_avg: number;
  price_sell: number;
  price_sell_avg: number;
  scu_buy: number;
  scu_sell_stock: number;
  status_buy: number;
  status_sell: number;
  container_sizes: string | null;
  date_modified: number;
  commodity_name: string;
  terminal_name: string;
};

export type UexTerminalLite = {
  id: number;
  name: string;
  nickname: string | null;
  star_system_name: string | null;
  planet_name: string | null;
  moon_name: string | null;
  city_name: string | null;
  is_refinery: boolean;
};

type UexTerminalRaw = {
  id: number;
  name: string;
  nickname: string | null;
  star_system_name: string | null;
  planet_name: string | null;
  moon_name: string | null;
  city_name: string | null;
  is_refinery: number;
  is_available: number;
  id_space_station?: number | null;
  id_outpost?: number | null;
  id_city?: number | null;
  id_planet?: number | null;
  id_moon?: number | null;
  space_station_name?: string | null;
  outpost_name?: string | null;
};

export type UexLocationType =
  | "space_station"
  | "outpost"
  | "city"
  | "moon"
  | "planet"
  | "other";

function deriveLocationType(t: UexTerminalRaw): UexLocationType {
  if (t.id_space_station) return "space_station";
  if (t.id_outpost) return "outpost";
  if (t.id_city) return "city";
  if (t.id_moon) return "moon";
  if (t.id_planet) return "planet";
  return "other";
}

/** Terminals mit Ort — für Filter/Auswahl im Routenplaner. */
export const listUexTerminals = createServerFn({ method: "GET" }).handler(async () => {
  const raw = await uexGet<UexTerminalRaw[]>("/terminals?type=commodity");
  return raw
    .filter((t) => t.is_available)
    .map((t) => ({
      id: t.id,
      name: t.name,
      nickname: t.nickname,
      star_system_name: t.star_system_name,
      planet_name: t.planet_name,
      moon_name: t.moon_name,
      city_name: t.city_name,
      is_refinery: !!t.is_refinery,
      location_type: deriveLocationType(t),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

export type UexTerminalOption = Awaited<ReturnType<typeof listUexTerminals>>[number];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Basisdaten: Katalog + Preise pro Terminal (aggregiert). */
export const listUexCommodities = createServerFn({ method: "GET" }).handler(async () => {
  const [commodities, prices, terminals] = await Promise.all([
    uexGet<UexCommodity[]>("/commodities"),
    uexGet<UexPriceRow[]>("/commodities_prices_all"),
    uexGet<UexTerminalRaw[]>("/terminals?type=commodity"),
  ]);

  // "Admin"-Terminals (feste NPC-Preise) heißen bei UEX "Admin - <Ort>".
  const adminTerminalIds = new Set<number>();
  for (const t of terminals) {
    if (!t.is_available) continue;
    if (/^admin\b/i.test(t.name ?? "")) adminTerminalIds.add(t.id);
  }

  const byCommodity = new Map<number, UexPriceRow[]>();
  for (const p of prices) {
    const arr = byCommodity.get(p.id_commodity);
    if (arr) arr.push(p);
    else byCommodity.set(p.id_commodity, [p]);
  }

  return commodities
    .filter((c) => c.is_available && c.is_available !== 0)
    .map((c) => {
      const rows = byCommodity.get(c.id) ?? [];
      const buys = rows.filter((r) => r.price_buy > 0 && r.status_buy > 0);
      const sells = rows.filter((r) => r.price_sell > 0 && r.status_sell > 0);
      const minBuy = buys.length ? buys.reduce((a, b) => (a.price_buy < b.price_buy ? a : b)) : null;
      const maxSell = sells.length ? sells.reduce((a, b) => (a.price_sell > b.price_sell ? a : b)) : null;
      const avgBuy = buys.length ? buys.reduce((s, r) => s + r.price_buy, 0) / buys.length : 0;
      const avgSell = sells.length ? sells.reduce((s, r) => s + r.price_sell, 0) / sells.length : 0;
      const adminBuys = buys.filter((r) => adminTerminalIds.has(r.id_terminal));
      const adminSells = sells.filter((r) => adminTerminalIds.has(r.id_terminal));
      const adminMinBuy = adminBuys.length
        ? adminBuys.reduce((a, b) => (a.price_buy < b.price_buy ? a : b))
        : null;
      const adminMaxSell = adminSells.length
        ? adminSells.reduce((a, b) => (a.price_sell > b.price_sell ? a : b))
        : null;
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        slug: toSlug(c.name),
        kind: c.kind,
        is_illegal: !!c.is_illegal,
        avg_buy: Math.round(avgBuy),
        avg_sell: Math.round(avgSell),
        best_buy: minBuy
          ? { terminal: minBuy.terminal_name, price: minBuy.price_buy, stock: minBuy.scu_buy }
          : null,
        best_sell: maxSell
          ? { terminal: maxSell.terminal_name, price: maxSell.price_sell, stock: maxSell.scu_sell_stock }
          : null,
        margin: minBuy && maxSell ? maxSell.price_sell - minBuy.price_buy : 0,
        terminal_count: buys.length + sells.length,
        is_admin_tradable: adminBuys.length > 0 || adminSells.length > 0,
        admin_best_buy: adminMinBuy ? Math.round(adminMinBuy.price_buy) : null,
        admin_best_sell: adminMaxSell ? Math.round(adminMaxSell.price_sell) : null,
        admin_margin_pct:
          adminMinBuy && adminMaxSell && adminMinBuy.price_buy > 0
            ? Math.round(
                ((adminMaxSell.price_sell - adminMinBuy.price_buy) / adminMinBuy.price_buy) * 100,
              )
            : null,
      };
    })
    .sort((a, b) => b.margin - a.margin);
});

export type UexCommoditySummary = Awaited<ReturnType<typeof listUexCommodities>>[number];

/** Detail: alle Terminals mit Preisen für ein Commodity (per Slug gefunden). */
export const getUexCommodityDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const commodities = await uexGet<UexCommodity[]>("/commodities");
    const commodity = commodities.find((c) => toSlug(c.name) === data.slug);
    if (!commodity) throw new Error("Commodity nicht gefunden");
    const prices = await uexGet<UexPriceRow[]>(
      `/commodities_prices?id_commodity=${commodity.id}`,
    );
    const rows = prices.map((r) => ({
      id: r.id,
      terminal_name: r.terminal_name,
      id_terminal: r.id_terminal,
      price_buy: r.price_buy,
      price_sell: r.price_sell,
      scu_buy: r.scu_buy,
      scu_sell_stock: r.scu_sell_stock,
      status_buy: r.status_buy,
      status_sell: r.status_sell,
      container_sizes: r.container_sizes,
      date_modified: r.date_modified,
    }));
    return {
      commodity: {
        id: commodity.id,
        name: commodity.name,
        code: commodity.code,
        kind: commodity.kind,
        slug: toSlug(commodity.name),
        is_illegal: !!commodity.is_illegal,
        weight_scu: commodity.weight_scu,
      },
      rows,
    };
  });

/** Routenplaner: beste Single-Hop Kauf → Verkauf Route für gegebenes SCU + Budget. */
export const computeUexRoutes = createServerFn({ method: "POST" })
  .inputValidator((data: {
    scu: number;
    budget?: number | null;
    minMargin?: number | null;
    includeIllegal?: boolean;
    limit?: number;
    fromSystem?: string | null;
    fromPlanet?: string | null;
    fromTerminalId?: number | null;
    toSystem?: string | null;
    toPlanet?: string | null;
    toTerminalId?: number | null;
    commoditySlug?: string | null;
    excludeRefineryOrigin?: boolean;
    fromTypes?: string[] | null;
    toTypes?: string[] | null;
  }) =>
    z
      .object({
        scu: z.number().int().positive().max(10_000),
        budget: z.number().positive().nullable().optional(),
        minMargin: z.number().nonnegative().nullable().optional(),
        includeIllegal: z.boolean().optional().default(false),
        limit: z.number().int().positive().max(100).optional().default(20),
        fromSystem: z.string().nullable().optional(),
        fromPlanet: z.string().nullable().optional(),
        fromTerminalId: z.number().int().nullable().optional(),
        toSystem: z.string().nullable().optional(),
        toPlanet: z.string().nullable().optional(),
        toTerminalId: z.number().int().nullable().optional(),
        commoditySlug: z.string().nullable().optional(),
        excludeRefineryOrigin: z.boolean().optional().default(false),
        fromTypes: z.array(z.string()).nullable().optional(),
        toTypes: z.array(z.string()).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const fromTypes = data.fromTypes && data.fromTypes.length ? new Set(data.fromTypes) : null;
    const toTypes = data.toTypes && data.toTypes.length ? new Set(data.toTypes) : null;
    const needTerminals =
      !!(data.fromSystem || data.fromPlanet || data.toSystem || data.toPlanet || data.excludeRefineryOrigin || fromTypes || toTypes);
    const [commodities, prices, terminals] = await Promise.all([
      uexGet<UexCommodity[]>("/commodities"),
      uexGet<UexPriceRow[]>("/commodities_prices_all"),
      needTerminals
        ? uexGet<UexTerminalRaw[]>("/terminals?type=commodity")
        : Promise.resolve([] as UexTerminalRaw[]),
    ]);
    const termMap = new Map<number, UexTerminalRaw>();
    for (const t of terminals) termMap.set(t.id, t);

    const matchesOrigin = (id: number): boolean => {
      if (data.fromTerminalId && id !== data.fromTerminalId) return false;
      if (!needTerminals) return true;
      const t = termMap.get(id);
      if (!t) return !data.fromSystem && !data.fromPlanet && !data.excludeRefineryOrigin && !fromTypes;
      if (data.excludeRefineryOrigin && t.is_refinery) return false;
      if (data.fromSystem && t.star_system_name !== data.fromSystem) return false;
      if (data.fromPlanet && t.planet_name !== data.fromPlanet) return false;
      if (fromTypes && !fromTypes.has(deriveLocationType(t))) return false;
      return true;
    };
    const matchesDest = (id: number): boolean => {
      if (data.toTerminalId && id !== data.toTerminalId) return false;
      if (!needTerminals) return true;
      const t = termMap.get(id);
      if (!t) return !data.toSystem && !data.toPlanet && !toTypes;
      if (data.toSystem && t.star_system_name !== data.toSystem) return false;
      if (data.toPlanet && t.planet_name !== data.toPlanet) return false;
      if (toTypes && !toTypes.has(deriveLocationType(t))) return false;
      return true;
    };

    const commMap = new Map<number, UexCommodity>();
    for (const c of commodities) commMap.set(c.id, c);

    const byCommodity = new Map<number, UexPriceRow[]>();
    for (const p of prices) {
      const arr = byCommodity.get(p.id_commodity);
      if (arr) arr.push(p);
      else byCommodity.set(p.id_commodity, [p]);
    }

    const results: Array<{
      commodity: string;
      commodity_slug: string;
      is_illegal: boolean;
      buy_terminal: string;
      sell_terminal: string;
      buy_price: number;
      sell_price: number;
      units: number;
      invest: number;
      profit: number;
      margin_per_scu: number;
      stock_available: number;
    }> = [];

    for (const [commodityId, rows] of byCommodity) {
      const c = commMap.get(commodityId);
      if (!c || !c.is_available) continue;
      if (!data.includeIllegal && c.is_illegal) continue;
      if (data.commoditySlug && toSlug(c.name) !== data.commoditySlug) continue;

      const buys = rows.filter(
        (r) => r.price_buy > 0 && r.status_buy > 0 && matchesOrigin(r.id_terminal),
      );
      const sells = rows.filter(
        (r) => r.price_sell > 0 && r.status_sell > 0 && matchesDest(r.id_terminal),
      );
      if (!buys.length || !sells.length) continue;

      // Beste Kombination: günstigster Kauf ↔ teuerster Verkauf
      const buy = buys.reduce((a, b) => (a.price_buy < b.price_buy ? a : b));
      const sell = sells.reduce((a, b) => (a.price_sell > b.price_sell ? a : b));
      if (buy.id_terminal === sell.id_terminal) continue;

      const margin = sell.price_sell - buy.price_buy;
      if (margin <= 0) continue;
      if (data.minMargin && margin < data.minMargin) continue;

      const stock = buy.scu_buy > 0 ? buy.scu_buy : data.scu;
      const maxByBudget = data.budget && data.budget > 0
        ? Math.floor(data.budget / buy.price_buy)
        : data.scu;
      const units = Math.max(0, Math.min(data.scu, stock, maxByBudget));
      if (units <= 0) continue;

      const invest = units * buy.price_buy;
      const profit = units * margin;
      results.push({
        commodity: c.name,
        commodity_slug: toSlug(c.name),
        is_illegal: !!c.is_illegal,
        buy_terminal: buy.terminal_name,
        sell_terminal: sell.terminal_name,
        buy_price: buy.price_buy,
        sell_price: sell.price_sell,
        units,
        invest: Math.round(invest),
        profit: Math.round(profit),
        margin_per_scu: margin,
        stock_available: buy.scu_buy,
      });
    }

    results.sort((a, b) => b.profit - a.profit);
    return results.slice(0, data.limit);
  });

export type UexRoute = Awaited<ReturnType<typeof computeUexRoutes>>[number];

/** Verkaufsplaner: für gegebene Ware+SCU die besten Verkaufsterminals. */
export const computeUexSellPlan = createServerFn({ method: "POST" })
  .inputValidator((data: {
    items: Array<{ commodityId: number; scu: number }>;
    system?: string | null;
    planet?: string | null;
    types?: string[] | null;
    includeIllegal?: boolean;
    limit?: number;
  }) =>
    z
      .object({
        items: z
          .array(
            z.object({
              commodityId: z.number().int().positive(),
              scu: z.number().positive().max(100_000),
            }),
          )
          .min(1)
          .max(30),
        system: z.string().nullable().optional(),
        planet: z.string().nullable().optional(),
        types: z.array(z.string()).nullable().optional(),
        includeIllegal: z.boolean().optional().default(true),
        limit: z.number().int().positive().max(20).optional().default(8),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const typeSet = data.types && data.types.length ? new Set(data.types) : null;
    const needTerminals = !!(data.system || data.planet || typeSet);
    const [commodities, terminals, ...priceLists] = await Promise.all([
      uexGet<UexCommodity[]>("/commodities"),
      needTerminals
        ? uexGet<UexTerminalRaw[]>("/terminals?type=commodity")
        : Promise.resolve([] as UexTerminalRaw[]),
      ...data.items.map((it) =>
        uexGet<UexPriceRow[]>(`/commodities_prices?id_commodity=${it.commodityId}`),
      ),
    ]);
    const termMap = new Map<number, UexTerminalRaw>();
    for (const t of terminals) termMap.set(t.id, t);
    const commMap = new Map<number, UexCommodity>();
    for (const c of commodities) commMap.set(c.id, c);

    const matches = (id: number): boolean => {
      if (!needTerminals) return true;
      const t = termMap.get(id);
      if (!t) return false;
      if (data.system && t.star_system_name !== data.system) return false;
      if (data.planet && t.planet_name !== data.planet) return false;
      if (typeSet && !typeSet.has(deriveLocationType(t))) return false;
      return true;
    };

    let totalPayout = 0;
    const items = data.items.map((it, i) => {
      const c = commMap.get(it.commodityId);
      const prices = priceLists[i] ?? [];
      if (!c || (!data.includeIllegal && c.is_illegal)) {
        return {
          commodity_id: it.commodityId,
          commodity_name: c?.name ?? "?",
          commodity_slug: c ? toSlug(c.name) : "",
          is_illegal: !!c?.is_illegal,
          scu: it.scu,
          terminals: [] as Array<{
            id: number;
            terminal: string;
            system: string | null;
            planet: string | null;
            location_type: UexLocationType;
            price: number;
            stock: number;
            units: number;
            payout: number;
            capped: boolean;
            date_modified: number;
          }>,
          best_payout: 0,
        };
      }
      const rows = prices
        .filter((r) => r.price_sell > 0 && r.status_sell > 0 && matches(r.id_terminal))
        .sort((a, b) => b.price_sell - a.price_sell)
        .slice(0, data.limit);
      const detailed = rows.map((r) => {
        const stock = r.scu_sell_stock;
        const hasCap = stock > 0;
        const units = hasCap ? Math.min(it.scu, stock) : it.scu;
        const payout = Math.round(units * r.price_sell);
        const t = termMap.get(r.id_terminal);
        return {
          id: r.id,
          terminal: r.terminal_name,
          system: t?.star_system_name ?? null,
          planet: t?.planet_name ?? null,
          location_type: t ? deriveLocationType(t) : ("other" as UexLocationType),
          price: r.price_sell,
          stock,
          units,
          payout,
          capped: hasCap && it.scu > stock,
          date_modified: r.date_modified,
        };
      });
      const best = detailed[0]?.payout ?? 0;
      totalPayout += best;
      return {
        commodity_id: it.commodityId,
        commodity_name: c.name,
        commodity_slug: toSlug(c.name),
        is_illegal: !!c.is_illegal,
        scu: it.scu,
        terminals: detailed,
        best_payout: best,
      };
    });

    return { items, total_best_payout: totalPayout };
  });

export type UexSellPlan = Awaited<ReturnType<typeof computeUexSellPlan>>;

/** Schiffe für die Auswahl: eigene Flotte + kompletter Katalog (jeweils mit SCU). */
export const listShipsForTrade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [catalog, fleet] = await Promise.all([
      supabase
        .from("ship_catalog")
        .select("slug,name,cargo_scu")
        .not("cargo_scu", "is", null)
        .gt("cargo_scu", 0)
        .order("cargo_scu", { ascending: false })
        .limit(500),
      supabase
        .from("user_ships")
        .select("id,ship_slug,ship_name,custom_name")
        .eq("user_id", userId),
    ]);
    return {
      catalog: (catalog.data ?? []) as Array<{ slug: string; name: string; cargo_scu: number }>,
      fleet: (fleet.data ?? []) as Array<{
        id: string;
        ship_slug: string;
        ship_name: string;
        custom_name: string | null;
      }>,
    };
  });