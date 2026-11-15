import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listMaterials,
  refreshAllMaterialSources,
  syncMineableCommodities,
  type MaterialListItem,
} from "@/lib/materials.functions";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  Pickaxe,
  Sprout,
  Recycle,
  ShoppingCart,
  Package,
  ChevronRight,
  Search,
  RefreshCw,
} from "lucide-react";
import { PageShell, StickyToolbar, StatGrid, StatCard } from "@/components/layout/PageShell";

export const Route = createFileRoute("/_authenticated/materialien/")({
  component: MaterialsPage,
});

type FilterKey = "all" | "mining" | "harvest" | "salvage" | "shop";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "mining", label: "Mining" },
  { key: "harvest", label: "Harvesting" },
  { key: "salvage", label: "Salvage" },
  { key: "shop", label: "Im Shop" },
];

function refToParam(ref: string): string {
  return encodeURIComponent(ref);
}

function MaterialsPage() {
  const listFn = useServerFn(listMaterials);
  const refreshFn = useServerFn(refreshAllMaterialSources);
  const syncMineableFn = useServerFn(syncMineableCommodities);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["materials", "list"],
    queryFn: () => listFn({ data: undefined }),
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshFn({ data: undefined }),
    onSuccess: (res) => {
      toast.success(
        `Bezugsquellen aktualisiert: ${res.refreshed}/${res.total} (${res.skipped} ohne Wiki-Match)`,
      );
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const syncMineableMut = useMutation({
    mutationFn: () => syncMineableFn({ data: undefined }),
    onSuccess: (res) => {
      toast.success(
        `Mining-Rohstoffe synchronisiert: ${res.created} neu, ${res.refreshed}/${res.total} aktualisiert`,
      );
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const items = useMemo<MaterialListItem[]>(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((m) => {
      if (needle && !m.name.toLowerCase().includes(needle)) return false;
      const a = m.acquisition;
      switch (filter) {
        case "mining":
          return !!a?.mineable;
        case "harvest":
          return !!a?.harvestable;
        case "salvage":
          return !!a?.salvage;
        case "shop":
          return !!a?.shop;
        default:
          return true;
      }
    });
  }, [data, q, filter]);

  const stats = useMemo(() => {
    const all = data ?? [];
    let mining = 0,
      harvest = 0,
      salvage = 0,
      shop = 0;
    for (const m of all) {
      const a = m.acquisition;
      if (a?.mineable) mining++;
      if (a?.harvestable) harvest++;
      if (a?.salvage) salvage++;
      if (a?.shop) shop++;
    }
    return { total: all.length, mining, harvest, salvage, shop };
  }, [data]);

  return (
    <PageShell
      eyebrow="Materialien"
      title="Material-Übersicht"
      description="Alle Materialien, die für Blueprints benötigt werden – inklusive Bezugsquellen."
      actions={
        <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => syncMineableMut.mutate()}
          disabled={syncMineableMut.isPending}
        >
          <Pickaxe
            className={cn("h-4 w-4", syncMineableMut.isPending && "animate-pulse")}
          />
          {syncMineableMut.isPending ? "Synchronisiere…" : "Mining-Rohstoffe synchronisieren"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshMut.isPending && "animate-spin")}
          />
          {refreshMut.isPending ? "Aktualisiere…" : "Bezugsquellen aktualisieren"}
        </Button>
        </div>
      }
    >
      <StatGrid cols={4}>
        <StatCard label="Materialien gesamt" value={stats.total} icon={Package} tone="brand" />
        <StatCard label="Mineable" value={stats.mining} icon={Pickaxe} tone="emerald" />
        <StatCard label="Harvestable" value={stats.harvest} icon={Sprout} tone="emerald" />
        <StatCard label="Im Shop" value={stats.shop} icon={ShoppingCart} tone="amber" />
      </StatGrid>

      <StickyToolbar>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Material suchen…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </StickyToolbar>

      {isLoading && (
        <LoadingScreen
          label="Lade Materialien"
          hint="// indexiere ressourcen-katalog"
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
          Keine Materialien gefunden.
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {items.map((m) => (
          <Link
            key={m.item_ref}
            to="/materialien/$ref"
            params={{ ref: refToParam(m.item_ref) }}
            className={cn(
              "group flex items-center gap-3 border border-brand/10 bg-background/60 p-3",
              "hover:border-brand/40 hover:bg-background transition",
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-brand/10 bg-muted/20">
              {m.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
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
                {m.kind && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {m.kind}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono">
                  in {m.used_in_count} Blueprint{m.used_in_count === 1 ? "" : "s"}
                </span>
                <AcquisitionIcons acq={m.acquisition} />
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-brand" />
          </Link>
        ))}
      </div>

      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
        // klick auf eintrag → details & bezugsquellen
      </p>
    </PageShell>
  );
}

function AcquisitionIcons({
  acq,
}: {
  acq: MaterialListItem["acquisition"];
}) {
  if (!acq)
    return (
      <span className="italic text-muted-foreground/60">
        Quellen noch nicht geladen
      </span>
    );
  const items: Array<{ on: boolean; icon: React.ReactNode; label: string }> = [
    {
      on: acq.mineable,
      icon: <Pickaxe className="h-3 w-3" />,
      label: "Mining",
    },
    {
      on: acq.harvestable,
      icon: <Sprout className="h-3 w-3" />,
      label: "Harvest",
    },
    {
      on: acq.salvage,
      icon: <Recycle className="h-3 w-3" />,
      label: "Salvage",
    },
    {
      on: acq.shop,
      icon: <ShoppingCart className="h-3 w-3" />,
      label: "Shop",
    },
  ];
  const active = items.filter((i) => i.on);
  if (active.length === 0)
    return (
      <span className="italic text-muted-foreground/60">
        keine Quelle bekannt
      </span>
    );
  return (
    <span className="flex items-center gap-2">
      {active.map((i, idx) => (
        <span
          key={idx}
          className="flex items-center gap-1 text-emerald-300/90"
          title={i.label}
        >
          {i.icon}
          <span className="text-[10px]">{i.label}</span>
        </span>
      ))}
    </span>
  );
}