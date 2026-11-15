import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Package, Route as RouteIcon, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell, StatGrid, StatCard } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { getUexCommodityDetail } from "@/lib/uex.functions";

export const Route = createFileRoute("/_authenticated/handel/commodity/$slug")({
  component: CommodityDetailPage,
});

function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE").format(n);
}

type SortKey = "sell" | "buy" | "stock" | "terminal";

function CommodityDetailPage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getUexCommodityDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["uex-commodity", slug],
    queryFn: () => fn({ data: { slug } }),
    staleTime: 60_000,
  });
  const [sort, setSort] = useState<SortKey>("sell");

  const sorted = useMemo(() => {
    if (!data) return [];
    const arr = [...data.rows];
    if (sort === "sell") arr.sort((a, b) => b.price_sell - a.price_sell);
    if (sort === "buy")
      arr.sort((a, b) => (a.price_buy || Infinity) - (b.price_buy || Infinity));
    if (sort === "stock") arr.sort((a, b) => b.scu_sell_stock - a.scu_sell_stock);
    if (sort === "terminal") arr.sort((a, b) => a.terminal_name.localeCompare(b.terminal_name));
    return arr;
  }, [data, sort]);

  if (isLoading) return <LoadingScreen label="Lade Preisdaten…" />;
  if (error || !data) {
    return (
      <PageShell title="Rohstoff nicht gefunden">
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error | undefined)?.message ?? "Unbekannter Rohstoff."}
        </div>
        <Button asChild variant="secondary">
          <Link to="/handel">
            <ArrowLeft className="mr-2 h-4 w-4" /> Zur Übersicht
          </Link>
        </Button>
      </PageShell>
    );
  }

  const buys = sorted.filter((r) => r.price_buy > 0 && r.status_buy > 0);
  const sells = sorted.filter((r) => r.price_sell > 0 && r.status_sell > 0);
  const bestBuy = buys.length
    ? buys.reduce((a, b) => (a.price_buy < b.price_buy ? a : b))
    : null;
  const bestSell = sells.length
    ? sells.reduce((a, b) => (a.price_sell > b.price_sell ? a : b))
    : null;

  return (
    <PageShell
      eyebrow={data.commodity.code}
      title={data.commodity.name}
      description={`${data.commodity.kind ?? "Commodity"} · ${data.rows.length} Terminals`}
      actions={
        <div className="flex gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link to="/handel">
              <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/handel/routenplaner">
              <RouteIcon className="mr-2 h-4 w-4" /> Routenplaner
            </Link>
          </Button>
        </div>
      }
    >
      {data.commodity.is_illegal && (
        <Badge variant="destructive" className="w-fit">
          Illegale Ware
        </Badge>
      )}
      <StatGrid>
        <StatCard
          icon={Package}
          label="Günstigster Kauf"
          value={bestBuy ? `${fmt(bestBuy.price_buy)} aUEC` : "—"}
          hint={bestBuy?.terminal_name}
        />
        <StatCard
          icon={Package}
          label="Teuerster Verkauf"
          value={bestSell ? `${fmt(bestSell.price_sell)} aUEC` : "—"}
          hint={bestSell?.terminal_name}
        />
        <StatCard
          icon={Package}
          label="Beste Marge/SCU"
          value={
            bestBuy && bestSell
              ? `+${fmt(bestSell.price_sell - bestBuy.price_buy)} aUEC`
              : "—"
          }
        />
      </StatGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-card/40 p-4">
          <div className="mb-2">
            <div className="text-sm font-medium">Top 5 Verkauf (höchster Preis)</div>
            <div className="text-xs text-muted-foreground">Hier bekommst du am meisten für deine Ware.</div>
          </div>
          <div className="divide-y divide-white/5">
            {sells.slice().sort((a, b) => b.price_sell - a.price_sell).slice(0, 5).map((r, i) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="truncate font-medium">{r.terminal_name}</span>
                  </div>
                  {r.scu_sell_stock > 0 && (
                    <div className="text-xs text-muted-foreground">Nachfrage: {fmt(r.scu_sell_stock)} SCU</div>
                  )}
                </div>
                <div className="font-mono text-emerald-400">{fmt(r.price_sell)}</div>
              </div>
            ))}
            {sells.length === 0 && <div className="py-4 text-xs text-muted-foreground">Aktuell kein Ankauf.</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-white/5 bg-card/40 p-4">
          <div className="mb-2">
            <div className="text-sm font-medium">Top 5 Kauf (günstigster Preis)</div>
            <div className="text-xs text-muted-foreground">Hier lädst du am günstigsten nach.</div>
          </div>
          <div className="divide-y divide-white/5">
            {buys.slice().sort((a, b) => a.price_buy - b.price_buy).slice(0, 5).map((r, i) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="truncate font-medium">{r.terminal_name}</span>
                  </div>
                  {r.scu_sell_stock > 0 && (
                    <div className="text-xs text-muted-foreground">Bestand: {fmt(r.scu_sell_stock)} SCU</div>
                  )}
                </div>
                <div className="font-mono">{fmt(r.price_buy)}</div>
              </div>
            ))}
            {buys.length === 0 && <div className="py-4 text-xs text-muted-foreground">Kein Verkäufer verfügbar.</div>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sortieren:</span>
        {(["sell", "buy", "stock", "terminal"] as SortKey[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={sort === k ? "default" : "outline"}
            onClick={() => setSort(k)}
          >
            <ArrowUpDown className="mr-1 h-3 w-3" />
            {k === "sell"
              ? "Verkauf"
              : k === "buy"
              ? "Kauf"
              : k === "stock"
              ? "Bestand"
              : "Terminal"}
          </Button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/5 bg-card/40">
        <div className="grid grid-cols-[minmax(0,2fr)_120px_120px_100px_100px] gap-3 border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <div>Terminal</div>
          <div className="text-right">Kauf</div>
          <div className="text-right">Verkauf</div>
          <div className="text-right">Stock (SCU)</div>
          <div className="text-right">Container</div>
        </div>
        {sorted.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(0,2fr)_120px_120px_100px_100px] gap-3 border-b border-white/5 px-4 py-2 text-sm"
          >
            <div className="min-w-0 truncate">{r.terminal_name}</div>
            <div className="text-right font-mono">
              {r.price_buy > 0 && r.status_buy > 0 ? fmt(r.price_buy) : "—"}
            </div>
            <div className="text-right font-mono text-emerald-400">
              {r.price_sell > 0 && r.status_sell > 0 ? fmt(r.price_sell) : "—"}
            </div>
            <div className="text-right font-mono text-muted-foreground">
              {r.scu_sell_stock > 0 ? fmt(r.scu_sell_stock) : "—"}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {r.container_sizes || "—"}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}