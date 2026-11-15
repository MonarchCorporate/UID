import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Gleicht die In-Game-Preise (aUEC) des Schiffskatalogs mit der
 * Star-Citizen-Wiki-API ab (`uex_prices`). Die Wiki-Daten stammen aus UEX und
 * sind deutlich aktueller als die Fleetyards-Preise.
 */
const WIKI = "https://api.star-citizen.wiki/api/v3/vehicles";

type WikiPrice = {
  price_buy?: number | null;
  price_rent?: number | null;
  terminal_name?: string | null;
  starmap_location?: { name?: string | null; star_system_name?: string | null } | null;
  date_updated?: string | null;
};

type WikiVehicle = {
  slug?: string | null;
  name?: string | null;
  game_name?: string | null;
  msrp?: number | null;
  uex_prices?: { purchase?: WikiPrice[] | null; rental?: WikiPrice[] | null } | null;
};

export type ShipPriceTerminal = {
  terminal: string;
  location: string | null;
  system: string | null;
  price: number;
  updated: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
}

async function fetchWikiVehicles(): Promise<WikiVehicle[]> {
  const out: WikiVehicle[] = [];
  let page = 1;
  let last = 1;
  do {
    const res = await fetch(`${WIKI}?limit=200&page=${page}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Wiki /vehicles ${res.status}`);
    const json = (await res.json()) as {
      data?: WikiVehicle[];
      meta?: { last_page?: number };
    };
    out.push(...(json.data ?? []));
    last = json.meta?.last_page ?? 1;
    page++;
  } while (page <= last && page <= 20);
  return out;
}

function mapTerminals(rows: WikiPrice[] | null | undefined): ShipPriceTerminal[] {
  return (rows ?? [])
    .filter((r) => typeof r.price_buy === "number" && (r.price_buy ?? 0) > 0)
    .map((r) => ({
      terminal: r.terminal_name ?? "Unbekannt",
      location: r.starmap_location?.name ?? null,
      system: r.starmap_location?.star_system_name ?? null,
      price: r.price_buy as number,
      updated: r.date_updated ?? null,
    }))
    .sort((a, b) => a.price - b.price);
}

export async function runShipPriceSync(): Promise<{
  vehicles: number;
  matched: number;
  updated: number;
  changed: Array<{ slug: string; from: number | null; to: number | null }>;
  unmatched: string[];
}> {
  const vehicles = await fetchWikiVehicles();
  const { data: catalog, error } = await supabaseAdmin
    .from("ship_catalog")
    .select("slug,name,price_uec")
    .limit(2000);
  if (error) throw new Error(error.message);

  const bySlug = new Map<string, { slug: string; price: number | null }>();
  const byName = new Map<string, { slug: string; price: number | null }>();
  for (const row of catalog ?? []) {
    const entry = { slug: row.slug as string, price: (row.price_uec as number | null) ?? null };
    bySlug.set(norm(row.slug as string), entry);
    byName.set(norm(row.name as string), entry);
  }

  let matched = 0;
  let updated = 0;
  const changed: Array<{ slug: string; from: number | null; to: number | null }> = [];
  const unmatched: string[] = [];
  const now = new Date().toISOString();

  for (const v of vehicles) {
    const hit =
      bySlug.get(norm(v.slug)) ??
      byName.get(norm(v.name)) ??
      byName.get(norm(v.game_name));
    if (!hit) {
      if (v.slug) unmatched.push(v.slug);
      continue;
    }
    matched++;
    const terminals = mapTerminals(v.uex_prices?.purchase);
    const best = terminals[0] ?? null;
    const rents = (v.uex_prices?.rental ?? [])
      .map((r) => r.price_rent)
      .filter((p): p is number => typeof p === "number" && p > 0)
      .sort((a, b) => a - b);

    const patch: Record<string, unknown> = {
      price_uec_terminal: best
        ? `${best.terminal}${best.system ? ` (${best.system})` : ""}`
        : null,
      price_uec_terminals: terminals,
      price_rent_uec: rents[0] ?? null,
      price_synced_at: now,
    };
    // Ohne UEX-Kaufeintrag ist das Schiff aktuell nicht im Spiel käuflich —
    // dann bleibt der bestehende Preis (Fleetyards) als Fallback stehen.
    if (best) {
      patch.price_uec = best.price;
      patch.price_source = "star-citizen.wiki";
    }
    if (typeof v.msrp === "number" && v.msrp > 0) patch.pledge_price_usd = v.msrp;

    const { error: upErr } = await supabaseAdmin
      .from("ship_catalog")
      .update(patch as never)
      .eq("slug", hit.slug);
    if (upErr) continue;
    updated++;
    const to = best ? best.price : (hit.price ?? null);
    if ((hit.price ?? null) !== to) changed.push({ slug: hit.slug, from: hit.price, to });
  }

  return { vehicles: vehicles.length, matched, updated, changed, unmatched };
}
