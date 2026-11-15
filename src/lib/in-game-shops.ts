import shopsData from "@/data/in-game-shops.json";

export type InGameShop = { name: string; location: string };
export type InGameShopInfo = { basePrice: number | null; shops: InGameShop[] };

const DATA = shopsData as Record<string, InGameShopInfo>;

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const INDEX: Record<string, InGameShopInfo> = {};
for (const [k, v] of Object.entries(DATA)) INDEX[norm(k)] = v;

/** Look up in-game shop info by ship name. Tries exact, then a few normalizations. */
export function lookupShops(name: string | null | undefined): InGameShopInfo | null {
  if (!name) return null;
  const n = norm(name);
  if (INDEX[n]) return INDEX[n];
  // strip common suffixes like "Bomber", "Explorer"
  const stripped = n.replace(/\s+(bomber|explorer|replica)$/i, "").trim();
  if (INDEX[stripped]) return INDEX[stripped];
  return null;
}