import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Coins, Search, TrendingUp, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageShell,
  StickyToolbar,
  StatGrid,
  StatCard,
} from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { listUexCommodities, type UexCommoditySummary } from "@/lib/uex.functions";
import { HandelNav } from "@/components/handel/HandelNav";
import { CommodityTicker } from "@/components/handel/CommodityTicker";

export const Route = createFileRoute("/_authenticated/handel/")({
  component: TradePage,
});

function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

function TradePage() {
  const fn = useServerFn(listUexCommodities);
  const { data, isLoading, error } = useQuery({
    queryKey: ["uex-commodities"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  const [q, setQ] = useState("");
  const [onlyLegal, setOnlyLegal] = useState(false);
  const [minMargin, setMinMargin] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");

  const kinds = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    for (const c of data) if (c.kind) s.add(c.kind);
    return Array.from(s).sort();
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const mm = Number(minMargin) || 0;
    return data.filter((c) => {
      if (needle && !c.name.toLowerCase().includes(needle) && !c.code.toLowerCase().includes(needle))
        return false;
      if (onlyLegal && c.is_illegal) return false;
      if (mm && c.margin < mm) return false;
      if (kind !== "all" && c.kind !== kind) return false;
      if (side === "buy" && !c.best_buy) return false;
      if (side === "sell" && !c.best_sell) return false;
      return true;
    });
  }, [data, q, onlyLegal, minMargin, kind, side]);

  const totals = useMemo(() => {
    if (!data) return { count: 0, avgMargin: 0, top: null as UexCommoditySummary | null };
    const withMargin = data.filter((c) => c.margin > 0);
    return {
      count: data.length,
      avgMargin: withMargin.length
        ? Math.round(withMargin.reduce((s, c) => s + c.margin, 0) / withMargin.length)
        : 0,
      top: withMargin[0] ?? null,
    };
  }, [data]);

  if (isLoading) return <LoadingScreen label="Lade Preise von UEX…" />;

  return (
    <PageShell
      eyebrow="Handel"
      title="Rohstoffe & Preise"
      description="Live-Preise aus dem UEX-Netzwerk. Marge = teuerster Verkauf − günstigster Kauf pro SCU."
      actions={<HandelNav />}
    >
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Preise konnten nicht geladen werden: {(error as Error).message}
        </div>
      )}

      <StatGrid>
        <StatCard icon={Coins} label="Commodities" value={fmt(totals.count)} />
        <StatCard icon={TrendingUp} label="Ø Marge / SCU" value={`${fmt(totals.avgMargin)} aUEC`} />
        <StatCard
          icon={TrendingUp}
          label="Beste Marge"
          value={totals.top ? `${totals.top.name} · ${fmt(totals.top.margin)} aUEC` : "—"}
        />
      </StatGrid>

      {data && <CommodityTicker data={data} />}

      <StickyToolbar>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rohstoff suchen…"
            className="pl-9"
          />
        </div>
        <Input
          type="number"
          value={minMargin}
          onChange={(e) => setMinMargin(e.target.value)}
          placeholder="Min. Marge/SCU"
          className="w-40"
        />
        <Button
          size="sm"
          variant={onlyLegal ? "default" : "outline"}
          onClick={() => setOnlyLegal((v) => !v)}
        >
          Nur legal
        </Button>
      </StickyToolbar>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Ansicht:</span>
        {([
          ["all", "Alle"],
          ["sell", "Verkaufbar"],
          ["buy", "Kaufbar"],
        ] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={side === k ? "default" : "outline"} onClick={() => setSide(k)}>
            {l}
          </Button>
        ))}
        {kinds.length > 0 && (
          <>
            <span className="ml-3 text-muted-foreground">Kategorie:</span>
            <Button size="sm" variant={kind === "all" ? "default" : "outline"} onClick={() => setKind("all")}>
              Alle
            </Button>
            {kinds.map((k) => (
              <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                {k}
              </Button>
            ))}
          </>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-card/40">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)_120px_40px] gap-3 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <div>Rohstoff</div>
          <div>Günstigster Kauf</div>
          <div>Teuerster Verkauf</div>
          <div className="text-right">Marge/SCU</div>
          <div />
        </div>
        {rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Keine Rohstoffe passen zu den Filtern.
          </div>
        )}
        {rows.map((c) => (
          <Link
            key={c.id}
            to="/handel/commodity/$slug"
            params={{ slug: c.slug }}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)_120px_40px] items-center gap-3 border-b border-white/5 px-4 py-3 text-sm transition hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.name}</span>
                {c.is_illegal && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                    Illegal
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.code}
                {c.kind ? ` · ${c.kind}` : ""}
              </div>
            </div>
            <div className="min-w-0 text-xs">
              {c.best_buy ? (
                <>
                  <div className="truncate text-foreground">{c.best_buy.terminal}</div>
                  <div className="text-muted-foreground">{fmt(c.best_buy.price)} aUEC</div>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className="min-w-0 text-xs">
              {c.best_sell ? (
                <>
                  <div className="truncate text-foreground">{c.best_sell.terminal}</div>
                  <div className="text-muted-foreground">{fmt(c.best_sell.price)} aUEC</div>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className={`text-right font-mono text-sm ${c.margin > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
              {c.margin > 0 ? `+${fmt(c.margin)}` : "—"}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </PageShell>
  );
}