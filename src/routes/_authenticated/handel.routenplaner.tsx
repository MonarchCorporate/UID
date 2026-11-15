import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Route as RouteIcon, TrendingUp, Coins, Package, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell, StatGrid, StatCard, SectionHeader } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { HandelNav } from "@/components/handel/HandelNav";
import {
  computeUexRoutes,
  listShipsForTrade,
  listUexTerminals,
  listUexCommodities,
} from "@/lib/uex.functions";

export const Route = createFileRoute("/_authenticated/handel/routenplaner")({
  component: RoutePlannerPage,
});

function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE").format(Math.round(n));
}

type ShipSource = "fleet" | "catalog";

function RoutePlannerPage() {
  const shipsFn = useServerFn(listShipsForTrade);
  const computeFn = useServerFn(computeUexRoutes);
  const terminalsFn = useServerFn(listUexTerminals);
  const commoditiesFn = useServerFn(listUexCommodities);

  const { data: ships, isLoading: shipsLoading } = useQuery({
    queryKey: ["uex-trade-ships"],
    queryFn: () => shipsFn(),
    staleTime: 5 * 60_000,
  });
  const { data: terminals } = useQuery({
    queryKey: ["uex-terminals"],
    queryFn: () => terminalsFn(),
    staleTime: 10 * 60_000,
  });
  const { data: commodities } = useQuery({
    queryKey: ["uex-commodities"],
    queryFn: () => commoditiesFn(),
    staleTime: 60_000,
  });

  const [source, setSource] = useState<ShipSource>("fleet");
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [manualScu, setManualScu] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [minMargin, setMinMargin] = useState<string>("");
  const [includeIllegal, setIncludeIllegal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fromSystem, setFromSystem] = useState<string>("any");
  const [fromPlanet, setFromPlanet] = useState<string>("any");
  const [fromTerminalId, setFromTerminalId] = useState<string>("any");
  const [toSystem, setToSystem] = useState<string>("any");
  const [toPlanet, setToPlanet] = useState<string>("any");
  const [toTerminalId, setToTerminalId] = useState<string>("any");
  const [commoditySlug, setCommoditySlug] = useState<string>("any");
  const [excludeRefineryOrigin, setExcludeRefineryOrigin] = useState(false);
  const [fromTypes, setFromTypes] = useState<string[]>([]);
  const [toTypes, setToTypes] = useState<string[]>([]);

  const systems = useMemo(() => {
    const s = new Set<string>();
    terminals?.forEach((t) => t.star_system_name && s.add(t.star_system_name));
    return Array.from(s).sort();
  }, [terminals]);

  const fromPlanets = useMemo(() => {
    const s = new Set<string>();
    terminals?.forEach((t) => {
      if (fromSystem !== "any" && t.star_system_name !== fromSystem) return;
      if (t.planet_name) s.add(t.planet_name);
    });
    return Array.from(s).sort();
  }, [terminals, fromSystem]);

  const toPlanets = useMemo(() => {
    const s = new Set<string>();
    terminals?.forEach((t) => {
      if (toSystem !== "any" && t.star_system_name !== toSystem) return;
      if (t.planet_name) s.add(t.planet_name);
    });
    return Array.from(s).sort();
  }, [terminals, toSystem]);

  const fromTerminals = useMemo(() => {
    return (terminals ?? []).filter((t) => {
      if (fromSystem !== "any" && t.star_system_name !== fromSystem) return false;
      if (fromPlanet !== "any" && t.planet_name !== fromPlanet) return false;
      return true;
    });
  }, [terminals, fromSystem, fromPlanet]);

  const toTerminals = useMemo(() => {
    return (terminals ?? []).filter((t) => {
      if (toSystem !== "any" && t.star_system_name !== toSystem) return false;
      if (toPlanet !== "any" && t.planet_name !== toPlanet) return false;
      return true;
    });
  }, [terminals, toSystem, toPlanet]);

  const advancedActive =
    fromSystem !== "any" ||
    fromPlanet !== "any" ||
    fromTerminalId !== "any" ||
    toSystem !== "any" ||
    toPlanet !== "any" ||
    toTerminalId !== "any" ||
    commoditySlug !== "any" ||
    excludeRefineryOrigin ||
    fromTypes.length > 0 ||
    toTypes.length > 0;

  const resetAdvanced = () => {
    setFromSystem("any");
    setFromPlanet("any");
    setFromTerminalId("any");
    setToSystem("any");
    setToPlanet("any");
    setToTerminalId("any");
    setCommoditySlug("any");
    setExcludeRefineryOrigin(false);
    setFromTypes([]);
    setToTypes([]);
  };

  const catalogMap = useMemo(() => {
    const m = new Map<string, { name: string; cargo_scu: number }>();
    ships?.catalog.forEach((s) => m.set(s.slug, { name: s.name, cargo_scu: s.cargo_scu }));
    return m;
  }, [ships]);

  const derivedScu = useMemo(() => {
    if (manualScu) return Number(manualScu) || 0;
    if (!selectedSlug) return 0;
    return catalogMap.get(selectedSlug)?.cargo_scu ?? 0;
  }, [manualScu, selectedSlug, catalogMap]);

  const selectedName = selectedSlug ? catalogMap.get(selectedSlug)?.name : null;

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof computeFn>[0]) => computeFn(input),
  });

  const onCompute = () => {
    if (derivedScu <= 0) return;
    mutation.mutate({
      data: {
        scu: derivedScu,
        budget: budget ? Number(budget) : null,
        minMargin: minMargin ? Number(minMargin) : null,
        includeIllegal,
        limit: 25,
        fromSystem: fromSystem !== "any" ? fromSystem : null,
        fromPlanet: fromPlanet !== "any" ? fromPlanet : null,
        fromTerminalId: fromTerminalId !== "any" ? Number(fromTerminalId) : null,
        toSystem: toSystem !== "any" ? toSystem : null,
        toPlanet: toPlanet !== "any" ? toPlanet : null,
        toTerminalId: toTerminalId !== "any" ? Number(toTerminalId) : null,
        commoditySlug: commoditySlug !== "any" ? commoditySlug : null,
        excludeRefineryOrigin,
        fromTypes: fromTypes.length ? fromTypes : null,
        toTypes: toTypes.length ? toTypes : null,
      },
    });
  };

  const results = mutation.data ?? [];
  const totals = useMemo(() => {
    if (!results.length) return null;
    return {
      count: results.length,
      topProfit: results[0].profit,
      avgProfit: Math.round(results.reduce((s, r) => s + r.profit, 0) / results.length),
    };
  }, [results]);

  if (shipsLoading) return <LoadingScreen label="Lade Schiffe…" />;

  return (
    <PageShell
      eyebrow="Handel"
      title="Routenplaner"
      description="Beste Single-Hop Handelsroute für dein Schiff — kauft, wo es günstig ist, verkauft, wo es teuer ist."
      actions={<HandelNav />}
    >
      <div className="rounded-2xl border border-white/8 bg-card/40 p-5 space-y-4">
        <SectionHeader icon={RouteIcon} title="Parameter" subtitle="Schiff, Budget und optionale Filter" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Schiff-Quelle</label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={source === "fleet" ? "default" : "outline"}
                onClick={() => {
                  setSource("fleet");
                  setSelectedSlug("");
                }}
              >
                Eigene Flotte
              </Button>
              <Button
                size="sm"
                variant={source === "catalog" ? "default" : "outline"}
                onClick={() => {
                  setSource("catalog");
                  setSelectedSlug("");
                }}
              >
                Katalog
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Schiff</label>
            <Select value={selectedSlug} onValueChange={setSelectedSlug}>
              <SelectTrigger>
                <SelectValue placeholder={source === "fleet" ? "Schiff aus deiner Flotte" : "Schiff aus dem Katalog"} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {source === "fleet" ? (
                  (ships?.fleet.length ?? 0) === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Keine Schiffe in deiner Flotte.
                    </div>
                  ) : (
                    ships!.fleet.map((s) => {
                      const cargo = catalogMap.get(s.ship_slug)?.cargo_scu ?? 0;
                      return (
                        <SelectItem key={s.id} value={s.ship_slug}>
                          {(s.custom_name || s.ship_name)}
                          {cargo > 0 ? ` · ${cargo} SCU` : " · keine Cargo-Daten"}
                        </SelectItem>
                      );
                    })
                  )
                ) : (
                  ships?.catalog.map((s) => (
                    <SelectItem key={s.slug} value={s.slug}>
                      {s.name} · {s.cargo_scu} SCU
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedName && (
              <div className="text-xs text-muted-foreground">
                Ausgewählt: <span className="text-foreground">{selectedName}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Cargo (SCU) — überschreibt Schiffswert
            </label>
            <Input
              type="number"
              value={manualScu}
              onChange={(e) => setManualScu(e.target.value)}
              placeholder={derivedScu ? String(derivedScu) : "z.B. 96"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Budget (aUEC, optional)</label>
            <Input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="z.B. 500000"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Min. Marge/SCU (optional)</label>
            <Input
              type="number"
              value={minMargin}
              onChange={(e) => setMinMargin(e.target.value)}
              placeholder="z.B. 500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Illegale Waren</label>
            <Button
              size="sm"
              variant={includeIllegal ? "default" : "outline"}
              onClick={() => setIncludeIllegal((v) => !v)}
            >
              {includeIllegal ? "Werden einbezogen" : "Ausgeschlossen"}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            Cargo: <span className="text-foreground font-mono">{derivedScu || "—"} SCU</span>
          </div>
          <Button onClick={onCompute} disabled={derivedScu <= 0 || mutation.isPending}>
            {mutation.isPending ? "Berechne…" : "Routen berechnen"}
          </Button>
        </div>

        {mutation.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {(mutation.error as Error).message}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/8 bg-card/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium hover:text-brand"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Erweiterte Route-Filter
            {advancedActive && (
              <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">
                aktiv
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {showAdvanced ? "einklappen" : "einblenden"}
            </span>
          </button>
          {advancedActive && (
            <Button size="sm" variant="ghost" onClick={resetAdvanced}>
              <X className="mr-1 h-3 w-3" /> Zurücksetzen
            </Button>
          )}
        </div>

        {showAdvanced && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FilterGroup title="Kauf-Ort (Origin)">
                <FilterSelect
                  label="System"
                  value={fromSystem}
                  onChange={(v) => {
                    setFromSystem(v);
                    setFromPlanet("any");
                    setFromTerminalId("any");
                  }}
                  options={systems.map((s) => ({ value: s, label: s }))}
                />
                <FilterSelect
                  label="Planet / Mond"
                  value={fromPlanet}
                  onChange={(v) => {
                    setFromPlanet(v);
                    setFromTerminalId("any");
                  }}
                  options={fromPlanets.map((p) => ({ value: p, label: p }))}
                />
                <FilterSelect
                  label="Terminal"
                  value={fromTerminalId}
                  onChange={setFromTerminalId}
                  options={fromTerminals.map((t) => ({
                    value: String(t.id),
                    label: `${t.name}${t.nickname ? ` (${t.nickname})` : ""}`,
                  }))}
                />
                <LocationTypeChips
                  label="Nur Ortstyp"
                  value={fromTypes}
                  onChange={setFromTypes}
                />
              </FilterGroup>

              <FilterGroup title="Verkauf-Ort (Destination)">
                <FilterSelect
                  label="System"
                  value={toSystem}
                  onChange={(v) => {
                    setToSystem(v);
                    setToPlanet("any");
                    setToTerminalId("any");
                  }}
                  options={systems.map((s) => ({ value: s, label: s }))}
                />
                <FilterSelect
                  label="Planet / Mond"
                  value={toPlanet}
                  onChange={(v) => {
                    setToPlanet(v);
                    setToTerminalId("any");
                  }}
                  options={toPlanets.map((p) => ({ value: p, label: p }))}
                />
                <FilterSelect
                  label="Terminal"
                  value={toTerminalId}
                  onChange={setToTerminalId}
                  options={toTerminals.map((t) => ({
                    value: String(t.id),
                    label: `${t.name}${t.nickname ? ` (${t.nickname})` : ""}`,
                  }))}
                />
                <LocationTypeChips
                  label="Nur Ortstyp"
                  value={toTypes}
                  onChange={setToTypes}
                />
              </FilterGroup>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FilterSelect
                label="Nur eine Ware"
                value={commoditySlug}
                onChange={setCommoditySlug}
                options={(commodities ?? []).map((c) => ({ value: c.slug, label: c.name }))}
              />
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Raffinerien als Kauf-Ort
                </label>
                <Button
                  size="sm"
                  variant={excludeRefineryOrigin ? "default" : "outline"}
                  onClick={() => setExcludeRefineryOrigin((v) => !v)}
                >
                  {excludeRefineryOrigin ? "Ausgeschlossen" : "Erlaubt"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {totals && (
        <StatGrid>
          <StatCard icon={RouteIcon} label="Routen gefunden" value={fmt(totals.count)} />
          <StatCard
            icon={TrendingUp}
            label="Bester Gewinn"
            value={`${fmt(totals.topProfit)} aUEC`}
            tone="emerald"
          />
          <StatCard icon={Coins} label="Ø Gewinn" value={`${fmt(totals.avgProfit)} aUEC`} />
        </StatGrid>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((r, i) => (
            <div
              key={`${r.commodity_slug}-${r.buy_terminal}-${r.sell_terminal}`}
              className="rounded-2xl border border-white/8 bg-card/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <Link
                      to="/handel/commodity/$slug"
                      params={{ slug: r.commodity_slug }}
                      className="font-display text-lg hover:text-brand"
                    >
                      {r.commodity}
                    </Link>
                    {r.is_illegal && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                        Illegal
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-foreground">{r.buy_terminal}</span>
                    <span>→</span>
                    <span className="text-emerald-300">{r.sell_terminal}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl text-emerald-400 tabular-nums">
                    +{fmt(r.profit)}
                  </div>
                  <div className="text-xs text-muted-foreground">aUEC Gewinn</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Menge" value={`${fmt(r.units)} SCU`} icon={Package} />
                <Metric label="Kauf/SCU" value={`${fmt(r.buy_price)} aUEC`} />
                <Metric label="Verkauf/SCU" value={`${fmt(r.sell_price)} aUEC`} />
                <Metric label="Investment" value={`${fmt(r.invest)} aUEC`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!mutation.isPending && mutation.isSuccess && results.length === 0 && (
        <div className="rounded-2xl border border-white/8 bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Keine profitable Route gefunden. Erhöhe das Budget oder senke „Min. Marge/SCU".
        </div>
      )}
    </PageShell>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof RouteIcon;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-background/40 p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Beliebig" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value="any">Beliebig</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const LOCATION_TYPES: Array<{ value: string; label: string }> = [
  { value: "space_station", label: "Raumstation" },
  { value: "city", label: "Stadt" },
  { value: "outpost", label: "Outpost" },
  { value: "moon", label: "Mond" },
  { value: "planet", label: "Planet" },
  { value: "other", label: "Sonstige" },
];

function LocationTypeChips({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {LOCATION_TYPES.map((t) => {
          const active = value.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => toggle(t.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                active
                  ? "border-primary/60 bg-primary/20 text-primary-foreground"
                  : "border-white/10 bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}