import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Hammer,
  ShoppingCart,
} from "lucide-react";
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
import {
  listCatalogItems,
  listCatalogKinds,
  getCatalogStats,
  ITEM_CATEGORIES,
} from "@/lib/item-catalog.functions";
import { getWikiSyncStatus } from "@/lib/items-wiki-sync.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/items/")({
  component: ItemsCatalogPage,
});

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const PAGE_SIZE = 48;

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm.toString().padStart(2, "0")}m`;
}

function ItemsCatalogPage() {
  const listFn = useServerFn(listCatalogItems);
  const kindsFn = useServerFn(listCatalogKinds);
  const statsFn = useServerFn(getCatalogStats);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [source, setSource] = useState("");
  const [onlyBp, setOnlyBp] = useState(false);
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q, 250);

  // Reset to page 1 when filters change.
  useEffect(() => setPage(1), [debouncedQ, category, kind, source, onlyBp]);

  const kindsQ = useQuery({
    queryKey: ["catalog-kinds"],
    queryFn: () => kindsFn(),
    staleTime: 5 * 60 * 1000,
  });

  const statsQ = useQuery({
    queryKey: ["catalog-stats"],
    queryFn: () => statsFn(),
    staleTime: 5 * 60 * 1000,
  });
  const stats = statsQ.data;

  const statusFn = useServerFn(getWikiSyncStatus);
  const statusQ = useQuery({
    queryKey: ["wiki-sync-status"],
    queryFn: () => statusFn(),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 2000 : 15000),
    refetchIntervalInBackground: false,
  });
  const run = statusQ.data;
  const isRunning = run?.status === "running";
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sinceRef = run ? (run.finished_at ?? run.started_at) : null;
  const sinceMs = sinceRef ? nowTick - new Date(sinceRef).getTime() : null;
  const runningMs = isRunning && run ? nowTick - new Date(run.started_at).getTime() : null;

  const dataQ = useQuery({
    queryKey: ["catalog-items", debouncedQ, category, kind, source, onlyBp, page],
    queryFn: () =>
      listFn({
        data: {
          q: debouncedQ,
          category,
          kind,
          source,
          hasBlueprint: onlyBp,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const total = dataQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = dataQ.data?.items ?? [];

  const sources = useMemo(() => ["", "wiki", "uex", "component"], []);

  const activeFilterCount =
    (category ? 1 : 0) +
    (kind ? 1 : 0) +
    (source ? 1 : 0) +
    (onlyBp ? 1 : 0) +
    (q.trim() ? 1 : 0);

  const resetFilters = () => {
    setCategory("");
    setKind("");
    setSource("");
    setOnlyBp(false);
    setQ("");
  };

  return (
    <PageShell
      eyebrow="database / items"
      title="Item-Katalog"
      description="Alle bekannten Star-Citizen-Items aus Wiki & UEX – mit Blueprint-Verlinkung und Bezugsquellen."
    >
      <StatGrid cols={4}>
        <StatCard
          label="Items"
          value={(stats?.total ?? total).toLocaleString("de-DE")}
          icon={Package}
          tone="brand"
        />
        <StatCard
          label="Wiki-Einträge"
          value={(stats?.bySource?.wiki ?? 0).toLocaleString("de-DE")}
        />
        <StatCard
          label="Mit Blueprint"
          value={(stats?.bp_output_refs ?? 0).toLocaleString("de-DE")}
          icon={Hammer}
        />
        <StatCard
          label="Wiki-Sync"
          value={
            isRunning
              ? `läuft · ${formatDuration(runningMs ?? 0)}`
              : run?.status === "error"
                ? "Fehler"
                : run?.status === "success"
                  ? `vor ${formatDuration(sinceMs ?? 0)}`
                  : "—"
          }
          hint={
            run?.status === "error"
              ? (run.error_message ?? undefined)?.slice(0, 60)
              : run?.status === "success" && run.inserted != null
                ? `+${run.inserted.toLocaleString("de-DE")} neu`
                : undefined
          }
        />
      </StatGrid>

      <StickyToolbar>
        {/* Row 1: search + actions */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name suchen (z. B. Ace Interceptor Helmet)…"
              className="pl-8"
            />
          </div>
          <Button
            size="sm"
            variant={onlyBp ? "default" : "outline"}
            onClick={() => setOnlyBp((v) => !v)}
          >
            <Hammer className="mr-1 h-3 w-3" /> nur mit Blueprint
          </Button>
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              Filter zurücksetzen ({activeFilterCount})
            </Button>
          )}
          <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {total.toLocaleString("de-DE")} Treffer
          </div>
        </div>

        {/* Row 2: category */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Kategorie
          </span>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={!category ? "default" : "outline"}
              onClick={() => {
                setCategory("");
                setKind("");
              }}
            >
              Alle
              <span className="ml-1.5 text-[10px] opacity-60">
                {stats?.total ?? ""}
              </span>
            </Button>
            {ITEM_CATEGORIES.map((c) => (
              <Button
                key={c.key}
                size="sm"
                variant={category === c.key ? "default" : "outline"}
                onClick={() => {
                  setCategory(c.key);
                  setKind("");
                }}
              >
                {c.label}
                <span className="ml-1.5 text-[10px] opacity-60">
                  {stats?.byCategory?.[c.key] ?? 0}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Row 3: kind + source */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Typ
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
          >
            <option value="">Alle Typen</option>
            {(kindsQ.data?.kinds ?? []).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs"
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "Alle Quellen" : s.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </StickyToolbar>

      {dataQ.isLoading && !dataQ.data ? (
        <LoadingScreen
          label="Item-Katalog wird geladen"
          hint="// wiki + uex fusion"
          cards={6}
        />
      ) : items.length === 0 ? (
        <div className="border border-dashed border-brand/15 p-6 text-center text-sm text-muted-foreground">
          {(stats?.total ?? 0) === 0
            ? 'Noch keine Items im Katalog. Starte den Wiki-Sync unter Admin → Datenquellen.'
            : "Keine Items gefunden."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {items.map((it) => (
            <Link
              key={it.item_ref}
              to="/items/$ref"
              params={{ ref: it.item_ref }}
              className={cn(
                "group flex items-center gap-3 border border-brand/10 bg-background/60 p-3",
                "hover:border-brand/40 hover:bg-background transition",
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-brand/10 bg-muted/20">
                {it.image_url ? (
                  <img
                    src={it.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Package className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="truncate font-display text-base">{it.name}</div>
                  {it.source && (
                    <Badge variant="outline" className="text-[9px] uppercase">
                      {it.source}
                    </Badge>
                  )}
                  {it.has_blueprint && (
                    <Badge
                      variant="outline"
                      className="border-amber-400/40 text-[9px] uppercase text-amber-300"
                    >
                      <Hammer className="mr-0.5 h-2.5 w-2.5" /> BP
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {it.kind && <span className="font-mono">{it.kind}</span>}
                  {(it.price_buy != null || it.price_sell != null) && (
                    <span className="flex items-center gap-1 font-mono text-emerald-300/90">
                      <ShoppingCart className="h-3 w-3" />
                      {it.price_buy != null
                        ? `${Math.round(it.price_buy).toLocaleString("de-DE")} aUEC`
                        : "—"}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground/60 group-hover:text-brand" />
            </Link>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Seite {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Weiter <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
        // klick auf eintrag → wiki-details, blueprints, shops &amp; lagerbestände
      </p>
    </PageShell>
  );
}