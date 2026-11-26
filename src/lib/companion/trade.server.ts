// Trade and mining data for the overlay, based on the UEX Corp API v2
// (same public endpoints the Handel pages use: /commodities,
// /commodities_prices_all, /terminals). Prices are community reports.
import type { RowDataPacket } from "mysql2/promise";
import { q } from "./db.server";
import { placeName } from "./names";

const UEX_BASE = "https://api.uexcorp.space/2.0";
const TTL_MS = 120_000;
const cache = new Map<string, { at: number; data: unknown }>();

async function uexGet<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const res = await fetch(`${UEX_BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`UEX ${path}: HTTP ${res.status}`);
  const json = (await res.json()) as { status: string; data: T; message?: string };
  if (json.status !== "ok") throw new Error(json.message || `UEX status ${json.status}`);
  cache.set(path, { at: Date.now(), data: json.data });
  return json.data;
}

type Commodity = {
  id: number; name: string; code: string; kind: string | null;
  is_available: number; is_illegal: number; is_mineral: number; is_raw: number; is_refined: number;
};
type Price = {
  id_commodity: number; id_terminal: number; price_buy: number; price_sell: number;
  scu_buy: number; scu_sell_stock: number; status_buy: number; status_sell: number;
  commodity_name: string; terminal_name: string; date_modified: number;
};
type Terminal = {
  id: number; name: string; nickname: string | null; is_available: number; is_refinery: number;
  star_system_name: string | null; planet_name: string | null; moon_name: string | null;
  city_name: string | null; space_station_name: string | null; outpost_name: string | null;
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

async function base() {
  const [commodities, prices, terminals] = await Promise.all([
    uexGet<Commodity[]>("/commodities"),
    uexGet<Price[]>("/commodities_prices_all"),
    uexGet<Terminal[]>("/terminals?type=commodity"),
  ]);
  const comm = new Map(commodities.filter((c) => c.is_available).map((c) => [c.id, c]));
  const term = new Map(terminals.filter((t) => t.is_available).map((t) => [t.id, t]));
  return { comm, prices: prices.filter((p) => comm.has(p.id_commodity) && term.has(p.id_terminal)), term };
}

function where(t: Terminal | undefined): string {
  if (!t) return "";
  return [t.space_station_name || t.city_name || t.outpost_name, t.moon_name || t.planet_name, t.star_system_name].filter(Boolean).join(" · ");
}

/** Terminals that belong to a game location code (e.g. Stanton2_Orison, RR_CRU_LEO). */
function terminalsAt(term: Map<number, Terminal>, location: string): Set<number> {
  const out = new Set<number>();
  const pretty = norm(placeName(location));
  const raw = norm(location.replace(/^Stanton\d[a-d]?_/, ""));
  for (const t of term.values()) {
    const hay = [t.city_name, t.space_station_name, t.outpost_name, t.name, t.nickname].map(norm);
    if (hay.some((h) => h && ((pretty.length >= 4 && h.includes(pretty)) || (raw.length >= 4 && h.includes(raw))))) out.add(t.id);
  }
  return out;
}

export type TradeOffer = {
  commodity: string; kind: string | null; illegal: boolean;
  buy_here: number | null; sell_here: number | null; stock_here: number | null; demand_here: number | null;
  best_sell: { price: number; terminal: string; where: string } | null;
  best_buy: { price: number; terminal: string; where: string } | null;
  margin: number | null;
};

/** What can be bought/sold at the player's current location, with the best counterpart elsewhere. */
export async function tradeAt(location: string | null) {
  const { comm, prices, term } = await base();
  const here = location ? terminalsAt(term, location) : new Set<number>();
  const byC = new Map<number, Price[]>();
  for (const p of prices) (byC.get(p.id_commodity) ?? byC.set(p.id_commodity, []).get(p.id_commodity)!).push(p);
  const offers: TradeOffer[] = [];
  for (const [id, rows] of byC) {
    const c = comm.get(id)!;
    const local = rows.filter((r) => here.has(r.id_terminal));
    if (here.size && !local.length) continue;
    const buyHere = local.filter((r) => r.price_buy > 0 && r.status_buy > 0).sort((a, b) => a.price_buy - b.price_buy)[0];
    const sellHere = local.filter((r) => r.price_sell > 0 && r.status_sell > 0).sort((a, b) => b.price_sell - a.price_sell)[0];
    const sells = rows.filter((r) => r.price_sell > 0 && r.status_sell > 0 && !here.has(r.id_terminal)).sort((a, b) => b.price_sell - a.price_sell);
    const buys = rows.filter((r) => r.price_buy > 0 && r.status_buy > 0 && !here.has(r.id_terminal)).sort((a, b) => a.price_buy - b.price_buy);
    const bs = sells[0];
    const bb = buys[0];
    offers.push({
      commodity: c.name, kind: c.kind, illegal: !!c.is_illegal,
      buy_here: buyHere?.price_buy ?? null, sell_here: sellHere?.price_sell ?? null,
      stock_here: buyHere?.scu_buy ?? null, demand_here: sellHere?.scu_sell_stock ?? null,
      best_sell: bs ? { price: bs.price_sell, terminal: bs.terminal_name, where: where(term.get(bs.id_terminal)) } : null,
      best_buy: bb ? { price: bb.price_buy, terminal: bb.terminal_name, where: where(term.get(bb.id_terminal)) } : null,
      margin: buyHere && bs ? bs.price_sell - buyHere.price_buy : null,
    });
  }
  offers.sort((a, b) => (b.margin ?? -1e12) - (a.margin ?? -1e12));
  return {
    location, location_name: location ? placeName(location) : null,
    terminals: [...here].map((id) => term.get(id)!.name),
    offers: offers.slice(0, 120),
    source: "UEX Corp (Community-Preise)",
  };
}

export type Route = {
  commodity: string; illegal: boolean; buy_terminal: string; buy_where: string; sell_terminal: string; sell_where: string;
  buy_price: number; sell_price: number; units: number; invest: number; profit: number; margin: number; stock: number;
};

/** Best single-hop routes for a cargo size, optionally starting at the current location. */
export async function routes(opts: { scu: number; budget?: number | null; from?: string | null; illegal?: boolean; limit?: number }) {
  const { comm, prices, term } = await base();
  const origin = opts.from ? terminalsAt(term, opts.from) : null;
  const byC = new Map<number, Price[]>();
  for (const p of prices) (byC.get(p.id_commodity) ?? byC.set(p.id_commodity, []).get(p.id_commodity)!).push(p);
  const out: Route[] = [];
  for (const [id, rows] of byC) {
    const c = comm.get(id)!;
    if (!opts.illegal && c.is_illegal) continue;
    const buys = rows.filter((r) => r.price_buy > 0 && r.status_buy > 0 && (!origin || !origin.size || origin.has(r.id_terminal)));
    const sells = rows.filter((r) => r.price_sell > 0 && r.status_sell > 0);
    if (!buys.length || !sells.length) continue;
    const buy = buys.reduce((a, b) => (a.price_buy < b.price_buy ? a : b));
    const sell = sells.reduce((a, b) => (a.price_sell > b.price_sell ? a : b));
    if (buy.id_terminal === sell.id_terminal) continue;
    const margin = sell.price_sell - buy.price_buy;
    if (margin <= 0) continue;
    const stock = buy.scu_buy > 0 ? buy.scu_buy : opts.scu;
    const byBudget = opts.budget && opts.budget > 0 ? Math.floor(opts.budget / buy.price_buy) : opts.scu;
    const units = Math.max(0, Math.min(opts.scu, stock, byBudget));
    if (!units) continue;
    out.push({
      commodity: c.name, illegal: !!c.is_illegal,
      buy_terminal: buy.terminal_name, buy_where: where(term.get(buy.id_terminal)),
      sell_terminal: sell.terminal_name, sell_where: where(term.get(sell.id_terminal)),
      buy_price: buy.price_buy, sell_price: sell.price_sell, units,
      invest: Math.round(units * buy.price_buy), profit: Math.round(units * margin), margin, stock: buy.scu_buy,
    });
  }
  out.sort((a, b) => b.profit - a.profit);
  return { routes: out.slice(0, opts.limit ?? 15), origin: opts.from ? placeName(opts.from) : null, origin_found: !origin || origin.size > 0 };
}

/** Minerals: where to sell (best prices, refineries) plus org-maintained mining spots. */
export async function mining() {
  const { comm, prices, term } = await base();
  const spots = await q<RowDataPacket>("SELECT mineral, location, star_system, method, notes FROM mining_spots ORDER BY mineral, location");
  const spotsBy = new Map<string, RowDataPacket[]>();
  for (const s of spots) {
    const k = norm(s.mineral);
    (spotsBy.get(k) ?? spotsBy.set(k, []).get(k)!).push(s);
  }
  const minerals = [...comm.values()].filter((c) => c.is_mineral || c.is_raw || /mineral|metal|gem|ore/i.test(c.kind ?? ""));
  const list = minerals.map((c) => {
    const sells = prices.filter((p) => p.id_commodity === c.id && p.price_sell > 0 && p.status_sell > 0).sort((a, b) => b.price_sell - a.price_sell);
    const baseName = c.name.replace(/\s*\((raw|ore)\)\s*$/i, "");
    return {
      mineral: c.name, raw: !!c.is_raw, kind: c.kind,
      best_sell: sells.slice(0, 3).map((s) => ({ price: s.price_sell, terminal: s.terminal_name, where: where(term.get(s.id_terminal)), refinery: !!term.get(s.id_terminal)?.is_refinery })),
      spots: (spotsBy.get(norm(baseName)) ?? spotsBy.get(norm(c.name)) ?? []).map((s) => ({ location: String(s.location), system: s.star_system, method: s.method, notes: s.notes })),
    };
  }).filter((m) => m.best_sell.length || m.spots.length);
  list.sort((a, b) => (b.best_sell[0]?.price ?? 0) - (a.best_sell[0]?.price ?? 0));
  return { minerals: list, refineries: [...term.values()].filter((t) => t.is_refinery).map((t) => ({ name: t.name, where: where(t) })), source: "UEX Corp (Preise) · Abbauorte von der Organisation gepflegt" };
}
