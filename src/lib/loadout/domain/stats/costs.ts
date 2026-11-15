import type { ComponentPick } from "../types";

export interface PriceInfo {
  item_ref: string;
  price: number | null;
  currency?: string;
  shop?: string | null;
  location?: string | null;
}

export interface CostAggregate {
  totalPrice: number;
  unknownCount: number;
  perShop: Array<{ shop: string; total: number; items: PriceInfo[] }>;
}

export function aggregateCosts(
  picks: ComponentPick[],
  prices: Record<string, PriceInfo | undefined>,
  includeStock = false,
): CostAggregate {
  const groups = new Map<string, { total: number; items: PriceInfo[] }>();
  let totalPrice = 0;
  let unknownCount = 0;
  for (const p of picks) {
    if (!p.item_ref) continue;
    const info = prices[p.item_ref];
    if (!info || info.price == null) {
      if (includeStock) unknownCount += 1;
      continue;
    }
    totalPrice += info.price;
    const shop = info.shop ?? "Unbekannt";
    if (!groups.has(shop)) groups.set(shop, { total: 0, items: [] });
    const g = groups.get(shop)!;
    g.total += info.price;
    g.items.push(info);
  }
  return {
    totalPrice,
    unknownCount,
    perShop: Array.from(groups.entries()).map(([shop, v]) => ({ shop, ...v })),
  };
}