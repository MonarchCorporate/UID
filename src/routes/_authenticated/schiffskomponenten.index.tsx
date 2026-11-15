import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listShipComponents,
  syncShipComponents,
  getShipComponentsStats,
  type ComponentListItem,
} from "@/lib/ship-components.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Search,
  Package,
  ChevronRight,
  ShoppingCart,
  Hammer,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell, StickyToolbar, StatGrid, StatCard } from "@/components/layout/PageShell";

export const Route = createFileRoute("/_authenticated/schiffskomponenten/")({
  component: ShipComponentsPage,
});

type CategoryKey =
  | "all"
  | "weapons"
  | "systems"
  | "missiles"
  | "propulsion"
  | "tools";

const CATEGORIES: Array<{ key: CategoryKey; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "weapons", label: "Waffen" },
  { key: "systems", label: "Systeme" },
  { key: "missiles", label: "Missiles" },
  { key: "propulsion", label: "Triebwerke" },
  { key: "tools", label: "Werkzeuge" },
];

function refToParam(ref: string): string {
  return encodeURIComponent(ref);
}

function formatPrice(n: number | null | undefined): string {
  if (n == null || n <= 0) return "—";
  return `${n.toLocaleString("de-DE")} aUEC`;
}

function ShipComponentsPage() {
  const listFn = useServerFn(listShipComponents);
  const statsFn = useServerFn(getShipComponentsStats);
  const syncFn = useServerFn(syncShipComponents);
  const qc = useQueryClient();

  const [category, setCategory] = useState<CategoryKey>("all");
  const [subCategory, setSubCategory] = useState<string>("all");
  const [sizes, setSizes] = useState<number[]>([]);
  const [q, setQ] = useState("");
  const [onlyBp, setOnlyBp] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ship-components", "list"],
    queryFn: () => listFn({ data: {} }),
  });

  const { data: stats } = useQuery({
    queryKey: ["ship-components", "stats"],
    queryFn: () => statsFn(),
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(
        `Sync abgeschlossen: ${r.inserted} von ${r.scanned} Komponenten importiert.`,
      );
      qc.invalidateQueries({ queryKey: ["ship-components"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const subCategories = useMemo(() => {
    const all = data ?? [];
    const scoped =
      category === "all"
        ? all
        : all.filter((m) => m.category === category);
    const counts = new Map<string, number>();
    for (const m of scoped) {
      const k = m.classification_label?.trim() || "Sonstige";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [data, category]);

  const availableSizes = useMemo(() => {
    const all = data ?? [];
    const scoped = all.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (subCategory !== "all") {
        const label = m.classification_label?.trim() || "Sonstige";
        if (label !== subCategory) return false;
      }
      return true;
    });
    const counts = new Map<number, number>();
    for (const m of scoped) {
      if (m.size == null) continue;
      counts.set(m.size, (counts.get(m.size) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  }, [data, category, subCategory]);

  const categoryCounts = useMemo(() => {
    const all = data ?? [];
    const counts: Record<string, number> = { all: all.length };
    for (const m of all) counts[m.category] = (counts[m.category] ?? 0) + 1;
    return counts;
  }, [data]);

  const items = useMemo<ComponentListItem[]>(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (subCategory !== "all") {
        const label = m.classification_label?.trim() || "Sonstige";
        if (label !== subCategory) return false;
      }
      if (sizes.length > 0 && (m.size == null || !sizes.includes(m.size)))
        return false;
      if (onlyBp && !m.has_blueprint) return false;
      if (needle) {
        const hay = `${m.name} ${m.manufacturer_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, q, category, subCategory, sizes, onlyBp]);

  const toggleSize = (s: number) =>
    setSizes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s].sort((a, b) => a - b),
    );

  const resetFilters = () => {
    setCategory("all");
    setSubCategory("all");
    setSizes([]);
    setQ("");
    setOnlyBp(false);
  };

  const activeFilterCount =
    (category !== "all" ? 1 : 0) +
    (subCategory !== "all" ? 1 : 0) +
    sizes.length +
    (onlyBp ? 1 : 0) +
    (q.trim() ? 1 : 0);

  return (
    <PageShell
      eyebrow="Schiffskomponenten"
      title="Schiffskomponenten"
      description="Alle Komponenten aus dem Star-Citizen-Wiki – mit Shop-Preisen und Blueprint-Verlinkung."
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          title="Vollständiger Wiki-Sync (Admin)"
        >
          <RefreshCw className={cn("mr-2 h-3 w-3", syncMut.isPending && "animate-spin")} />
          {syncMut.isPending ? "Synct…" : "Sync"}
        </Button>
      }
    >
      <StatGrid cols={4}>
        <StatCard label="Komponenten" value={stats?.total ?? "—"} icon={Package} tone="brand" />
        <StatCard label="Waffen" value={categoryCounts.weapons ?? 0} />
        <StatCard label="Systeme" value={categoryCounts.systems ?? 0} />
        <StatCard
          label="Triebwerke"
          value={categoryCounts.propulsion ?? 0}
          hint={
            stats?.last_synced_at
              ? `Sync: ${new Date(stats.last_synced_at).toLocaleDateString("de-DE")}`
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
              placeholder="Name oder Hersteller suchen…"
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
        </div>

        {/* Row 2: category */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Kategorie
          </span>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <Button
                key={c.key}
                size="sm"
                variant={category === c.key ? "default" : "outline"}
                onClick={() => {
                  setCategory(c.key);
                  setSubCategory("all");
                }}
              >
                {c.label}
                <span className="ml-1.5 text-[10px] opacity-60">
                  {categoryCounts[c.key] ?? 0}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Row 3: subcategory */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Typ
          </span>
          <Select value={subCategory} onValueChange={setSubCategory}>
            <SelectTrigger className="h-9 w-[260px] text-xs">
              <SelectValue placeholder="Alle Typen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              {subCategories.map(([label, n]) => (
                <SelectItem key={label} value={label}>
                  {label} ({n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 4: sizes */}
        {availableSizes.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              Größe
            </span>
            <div className="flex flex-wrap gap-1">
              {availableSizes.map(([s, n]) => {
                const active = sizes.includes(s);
                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 min-w-[44px] px-2 font-mono"
                    onClick={() => toggleSize(s)}
                  >
                    S{s}
                    <span className="ml-1 text-[10px] opacity-60">{n}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </StickyToolbar>

      {isLoading && (
        <LoadingScreen
          label="Lade Komponenten"
          hint="// scanne schiffs-systeme"
          cards={6}
        />
      )}
      {error && (
        <div className="text-sm text-rose-300">
          Fehler beim Laden: {(error as Error).message}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="border border-dashed border-brand/15 p-6 text-center text-sm text-muted-foreground">
          {data && data.length === 0
            ? 'Noch keine Komponenten geladen. Klick auf „Sync", um den Wiki-Import zu starten (Admin-Recht nötig).'
            : "Keine Komponenten gefunden."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((m) => (
          <Link
            key={m.item_ref}
            to="/schiffskomponenten/$ref"
            params={{ ref: refToParam(m.item_ref) }}
            className={cn(
              "group flex items-center gap-3 border border-brand/10 bg-background/60 p-3",
              "hover:border-brand/40 hover:bg-background transition",
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-brand/10 bg-muted/20">
              {m.image_url ? (
                <img
                  src={m.image_url}
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
                <div className="truncate font-display text-base">{m.name}</div>
                {m.size != null && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    S{m.size}
                  </Badge>
                )}
                {m.grade && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {m.grade}
                  </Badge>
                )}
                {m.has_blueprint && (
                  <Badge
                    variant="outline"
                    className="border-amber-400/40 text-[9px] uppercase text-amber-300"
                  >
                    <Hammer className="mr-0.5 h-2.5 w-2.5" /> BP
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {m.manufacturer_name && (
                  <span>{m.manufacturer_name}</span>
                )}
                {m.classification_label && (
                  <span className="font-mono">{m.classification_label}</span>
                )}
                <span
                  className={cn(
                    "flex items-center gap-1 font-mono",
                    m.min_price_buy ? "text-emerald-300/90" : "",
                  )}
                  title={
                    m.shop_count > 0
                      ? `${m.shop_count} Shop${m.shop_count === 1 ? "" : "s"}`
                      : "nicht im Shop"
                  }
                >
                  <ShoppingCart className="h-3 w-3" />
                  {formatPrice(m.min_price_buy)}
                </span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-brand" />
          </Link>
        ))}
      </div>

      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
        // klick auf eintrag → shops, specs &amp; blueprint
      </p>
    </PageShell>
  );
}