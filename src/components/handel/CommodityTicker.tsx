import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { UexCommoditySummary } from "@/lib/uex.functions";

function compact(n: number): string {
  if (Math.abs(n) >= 1000) {
    const v = n / 1000;
    return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(v)}K`;
  }
  return new Intl.NumberFormat("de-DE").format(Math.round(n));
}

type Mode = "auto" | "price" | "margin";

export function CommodityTicker({ data }: { data: UexCommoditySummary[] }) {
  const [mode, setMode] = useState<Mode>("auto");
  const [phase, setPhase] = useState<"price" | "margin">("price");

  useEffect(() => {
    if (mode !== "auto") return;
    const t = setInterval(() => setPhase((p) => (p === "price" ? "margin" : "price")), 5000);
    return () => clearInterval(t);
  }, [mode]);

  const shown: "price" | "margin" = mode === "auto" ? phase : mode;

  const rows = useMemo(
    () =>
      data
        .filter((c) => c.is_admin_tradable)
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code)),
    [data],
  );

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/5 bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Admin-Terminals · Übersicht</div>
          <div className="text-xs text-muted-foreground">
            Zeigt abwechselnd den besten Verkaufspreis und die maximal mögliche Marge in Prozent.
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ["auto", "Auto"],
              ["price", "Preis"],
              ["margin", "Marge %"],
            ] as const
          ).map(([k, l]) => (
            <Button
              key={k}
              size="sm"
              variant={mode === k ? "default" : "outline"}
              onClick={() => setMode(k)}
            >
              {l}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12">
        {rows.map((c) => {
          const price = c.admin_best_sell;
          const pct = c.admin_margin_pct;
          const isMargin = shown === "margin";
          const value = isMargin
            ? pct === null
              ? "—"
              : `${pct}%`
            : price === null
              ? "—"
              : compact(price);
          const tone = !isMargin
            ? "text-foreground"
            : pct === null
              ? "text-muted-foreground"
              : pct > 0
                ? "text-emerald-400"
                : pct < 0
                  ? "text-destructive"
                  : "text-muted-foreground";
          return (
            <Link
              key={c.id}
              to="/handel/commodity/$slug"
              params={{ slug: c.slug }}
              title={`${c.name}${price !== null ? ` · Verkauf ${compact(price)} aUEC` : ""}${
                pct !== null ? ` · Marge ${pct}%` : ""
              }`}
              className="flex items-center justify-between gap-1 rounded-md border border-white/5 bg-background/40 px-2 py-1.5 transition hover:border-white/15 hover:bg-white/[0.04]"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.code}
              </span>
              <span
                key={shown}
                className={`animate-in fade-in duration-500 font-mono text-[11px] tabular-nums ${tone}`}
              >
                {value}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}