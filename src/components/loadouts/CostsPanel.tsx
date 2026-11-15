/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import type { ComponentPick } from "@/lib/loadout/domain/types";
import { ShoppingCart } from "lucide-react";

interface ShopRow {
  item: string;
  terminal: string;
  location: string | null;
  system: string | null;
  price: number;
}

function extractShops(picks: ComponentPick[]): { rows: ShopRow[]; total: number; unknown: number } {
  const rows: ShopRow[] = [];
  let total = 0;
  let unknown = 0;

  for (const p of picks) {
    if (!p.item_ref) continue;
    const raw: any = p.raw;
    const shops: any[] =
      raw?.shops ??
      raw?.uex_prices?.purchase ??
      [];
    const name = raw?.name ?? p.name ?? p.slot_key;

    // Pick cheapest buy price.
    let best: { price: number; terminal: string; location: string | null; system: string | null } | null = null;
    for (const s of shops) {
      const price = Number(s.price_buy);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (!best || price < best.price) {
        best = {
          price,
          terminal: s.terminal_name ?? s.terminal_code ?? "Unbekannt",
          location: s.location ?? s.starmap_location?.name ?? null,
          system: s.system ?? s.starmap_location?.star_system_name ?? null,
        };
      }
    }
    if (best) {
      rows.push({ item: name, ...best });
      total += best.price;
    } else {
      unknown += 1;
    }
  }
  rows.sort((a, b) => b.price - a.price);
  return { rows, total, unknown };
}

export function CostsPanel({ picks }: { picks: ComponentPick[] }) {
  const { rows, total, unknown } = useMemo(() => extractShops(picks), [picks]);

  if (!rows.length && unknown === 0) {
    return (
      <div className="rounded-md border border-white/8 bg-background/40 p-3 text-xs text-muted-foreground">
        Keine Preisdaten für die aktuellen Komponenten.
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <span className="flex items-center gap-2 text-muted-foreground">
          <ShoppingCart className="h-3.5 w-3.5" /> Σ Beschaffung
        </span>
        <span className="font-mono tabular-nums text-brand">
          {total.toLocaleString("de-DE")} aUEC
        </span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div
            key={`${r.item}-${i}`}
            className="rounded border border-white/5 bg-background/30 px-2 py-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{r.item}</span>
              <span className="font-mono tabular-nums">
                {r.price.toLocaleString("de-DE")}
              </span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {r.terminal}
              {r.location ? ` · ${r.location}` : ""}
              {r.system ? ` · ${r.system}` : ""}
            </div>
          </div>
        ))}
      </div>
      {unknown > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {unknown} Komponente(n) ohne bekannte Verkaufsstelle.
        </div>
      )}
    </div>
  );
}