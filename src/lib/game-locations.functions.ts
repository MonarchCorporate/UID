import { createServerFn } from "@tanstack/react-start";
import { SC_LOCATIONS, type SCLocationKind, type SCLocationPreset } from "@/data/sc-locations";

// Orte und Rohstoffe live aus UEX (alle 12 h neu geladen). Die fest
// eingebauten Presets bleiben erhalten, damit vorhandene Lagerorte ihre
// Kennung behalten; UEX ergänzt neue Städte, Stationen und Außenposten.

const UEX = "https://api.uexcorp.space/2.0";
const TTL = 12 * 60 * 60 * 1000;

type UexPlace = {
  id: number;
  name: string;
  star_system_name?: string | null;
  planet_name?: string | null;
  moon_name?: string | null;
  orbit_name?: string | null;
  is_available_live?: number;
};

let locCache: { at: number; data: SCLocationPreset[] } | null = null;
let commCache: { at: number; data: string[] } | null = null;

async function uex<T>(path: string): Promise<T> {
  const res = await fetch(`${UEX}${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`UEX ${path}: ${res.status}`);
  const j = (await res.json()) as { data: T };
  return j.data;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const listGameLocations = createServerFn({ method: "GET" }).handler(async (): Promise<SCLocationPreset[]> => {
  if (locCache && Date.now() - locCache.at < TTL) return locCache.data;
  try {
    const [cities, stations, outposts] = await Promise.all([
      uex<UexPlace[]>("/cities"),
      uex<UexPlace[]>("/space_stations"),
      uex<UexPlace[]>("/outposts"),
    ]);
    const known = new Set(SC_LOCATIONS.map((p) => norm(p.name)));
    const extra: SCLocationPreset[] = [];
    const add = (p: UexPlace, kind: SCLocationKind) => {
      if (p.is_available_live === 0 || !p.name || known.has(norm(p.name))) return;
      known.add(norm(p.name));
      const system = p.star_system_name || "Sonstige";
      extra.push({ key: `${system.toLowerCase()}:${slug(p.name)}`, name: p.name, system, kind });
    };
    cities.forEach((c) => add(c, "Stadt"));
    stations.forEach((s) =>
      add(s, /lagrange|\bL[1-5]\b/i.test(`${s.orbit_name ?? ""} ${s.name}`) ? "Rest Stop (Lagrange)" : /gateway|jump/i.test(s.name) ? "Jump Gate Station" : "Raumstation"),
    );
    outposts.forEach((o) => add(o, /distribution|logistics/i.test(o.name) ? "Distribution Center" : "Outpost"));
    const data = [...SC_LOCATIONS, ...extra.sort((a, b) => a.name.localeCompare(b.name))];
    locCache = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.warn("[locations] UEX nicht erreichbar, nutze Presets", e);
    return SC_LOCATIONS;
  }
});

export const listCommodityNames = createServerFn({ method: "GET" }).handler(async (): Promise<string[]> => {
  if (commCache && Date.now() - commCache.at < TTL) return commCache.data;
  try {
    const rows = await uex<{ name: string; is_available_live?: number }[]>("/commodities");
    const data = rows
      .filter((r) => r.is_available_live !== 0 && r.name)
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b));
    commCache = { at: Date.now(), data };
    return data;
  } catch {
    const { COMMODITIES } = await import("@/data/commodities");
    return COMMODITIES;
  }
});
