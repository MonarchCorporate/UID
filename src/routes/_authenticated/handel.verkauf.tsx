import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Coins, Package, Plus, Trash2, Search, Store } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageShell, StatGrid, StatCard } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { HandelNav } from "@/components/handel/HandelNav";
import {
  computeUexSellPlan,
  listUexCommodities,
  listUexTerminals,
} from "@/lib/uex.functions";

export const Route = createFileRoute("/_authenticated/handel/verkauf")({
  component: SellPlannerPage,
});

function fmt(n: number): string {
  return new Intl.NumberFormat("de-DE").format(Math.round(n));
}

type Row = { commodityId: number; slug: string; name: string; scu: string };
const STORAGE_KEY = "handel:sellplan:v1";

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "space_station", label: "Raumstation" },
  { value: "city", label: "Stadt" },
  { value: "outpost", label: "Außenposten" },
  { value: "moon", label: "Mond" },
  { value: "planet", label: "Planet" },
  { value: "other", label: "Sonstige" },
];

function SellPlannerPage() {
  const commoditiesFn = useServerFn(listUexCommodities);
  const terminalsFn = useServerFn(listUexTerminals);
  const computeFn = useServerFn(computeUexSellPlan);

  const { data: commodities, isLoading } = useQuery({
    queryKey: ["uex-commodities"],
    queryFn: () => commoditiesFn(),
    staleTime: 60_000,
  });
  const { data: terminals } = useQuery({
    queryKey: ["uex-terminals"],
    queryFn: () => terminalsFn(),
    staleTime: 10 * 60_000,
  });

  const [rows, setRows] = useState<Row[]>([]);
  const [system, setSystem] = useState("any");
  const [planet, setPlanet] = useState("any");
  const [types, setTypes] = useState<string[]>([]);
  const [includeIllegal, setIncludeIllegal] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRows(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      /* noop */
    }
  }, [rows]);

  const systems = useMemo(() => {
    const s = new Set<string>();
    terminals?.forEach((t) => t.star_system_name && s.add(t.star_system_name));
    return Array.from(s).sort();
  }, [terminals]);

  const planets = useMemo(() => {
    const s = new Set<string>();
    terminals?.forEach((t) => {
      if (system !== "any" && t.star_system_name !== system) return;
      if (t.planet_name) s.add(t.planet_name);
    });
    return Array.from(s).sort();
  }, [terminals, system]);

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof computeFn>[0]) => computeFn(input),
  });

  const addRow = (c: { id: number; slug: string; name: string }) => {
    setRows((prev) => {
      if (prev.some((r) => r.commodityId === c.id)) return prev;
      return [...prev, { commodityId: c.id, slug: c.slug, name: c.name, scu: "100" }];
    });
    setPickerOpen(false);
    mutation.reset();
  };

  const updateScu = (id: number, scu: string) => {
    setRows((prev) => prev.map((r) => (r.commodityId === id ? { ...r, scu } : r)));
    mutation.reset();
  };
  const removeRow = (id: number) => {
    setRows((prev) => prev.filter((r) => r.commodityId !== id));
    mutation.reset();
  };
  const clearRows = () => {
    setRows([]);
    mutation.reset();
  };

  const runCompute = () => {
    const items = rows
      .map((r) => ({ commodityId: r.commodityId, scu: Number(r.scu) || 0 }))
      .filter((r) => r.scu > 0);
    if (!items.length) return;
    mutation.mutate({
      data: {
        items,
        system: system !== "any" ? system : null,
        planet: planet !== "any" ? planet : null,
        types: types.length ? types : null,
        includeIllegal,
        limit: 8,
      },
    });
  };

  const result = rows.length > 0 ? mutation.data : undefined;

  if (isLoading) return <LoadingScreen label="Lade Rohstoffe…" />;

  return (
    <PageShell
      eyebrow="Handel"
      title="Verkaufsplaner"
      description="Trage ein, was du an Bord hast — bekomme die besten Verkaufsterminals inkl. Erlös und Bestand-Cap."
      actions={<HandelNav />}
    >
      <div className="rounded-2xl border border-white/8 bg-card/40 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Deine Ladung</div>
            <div className="text-xs text-muted-foreground">
              Rohstoffe hinzufügen und SCU-Menge eintragen.
            </div>
          </div>
          <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clearRows}>
              Zurücksetzen
            </Button>
          )}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> Rohstoff hinzufügen
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0">
              <Command>
                <div className="flex items-center border-b border-white/5 px-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <CommandInput placeholder="Rohstoff suchen…" className="border-0" />
                </div>
                <CommandList>
                  <CommandEmpty>Nichts gefunden.</CommandEmpty>
                  <CommandGroup>
                    {(commodities ?? []).map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name} ${c.code}`}
                        onSelect={() =>
                          addRow({ id: c.id, slug: c.slug, name: c.name })
                        }
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {c.code}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
            Noch keine Waren hinzugefügt.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.commodityId}
                className="grid grid-cols-[minmax(0,1fr)_120px_36px] items-center gap-3 rounded-xl border border-white/5 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    value={r.scu}
                    onChange={(e) => updateScu(r.commodityId, e.target.value)}
                    className="h-8 text-right"
                  />
                  <span className="text-xs text-muted-foreground">SCU</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeRow(r.commodityId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Select value={system} onValueChange={(v) => { setSystem(v); setPlanet("any"); }}>
            <SelectTrigger>
              <SelectValue placeholder="System (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Alle Systeme</SelectItem>
              {systems.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={planet} onValueChange={setPlanet}>
            <SelectTrigger>
              <SelectValue placeholder="Planet (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Alle Planeten</SelectItem>
              {planets.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={includeIllegal ? "default" : "outline"}
            onClick={() => setIncludeIllegal((v) => !v)}
          >
            {includeIllegal ? "Illegal einbezogen" : "Nur legal"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Ortstyp:</span>
          {TYPE_OPTIONS.map((t) => {
            const on = types.includes(t.value);
            return (
              <Button
                key={t.value}
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() =>
                  setTypes((prev) =>
                    on ? prev.filter((v) => v !== t.value) : [...prev, t.value],
                  )
                }
              >
                {t.label}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center justify-end pt-1">
          <Button
            onClick={runCompute}
            disabled={rows.length === 0 || mutation.isPending}
          >
            {mutation.isPending ? "Berechne…" : "Verkaufsorte finden"}
          </Button>
        </div>

        {mutation.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {(mutation.error as Error).message}
          </div>
        )}
      </div>

      {result && (
        <>
          <StatGrid>
            <StatCard
              icon={Coins}
              label="Bester Gesamt-Erlös"
              value={`${fmt(result.total_best_payout)} aUEC`}
              tone="emerald"
            />
            <StatCard
              icon={Package}
              label="Waren"
              value={String(result.items.length)}
            />
            <StatCard
              icon={Store}
              label="Ohne Abnehmer"
              value={String(result.items.filter((i) => i.terminals.length === 0).length)}
            />
          </StatGrid>

          <div className="space-y-4">
            {result.items.map((item) => (
              <div
                key={item.commodity_id}
                className="rounded-2xl border border-white/8 bg-card/40 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.commodity_name}</span>
                      {item.is_illegal && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                          Illegal
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmt(item.scu)} SCU an Bord
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Best-Erlös</div>
                    <div className="font-mono text-sm text-emerald-400">
                      {fmt(item.best_payout)} aUEC
                    </div>
                  </div>
                </div>

                {item.terminals.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-background/30 p-3 text-xs text-muted-foreground">
                    Kein passender Abnehmer gefunden.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/5">
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_90px_100px_120px] gap-2 border-b border-white/5 bg-background/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <div>Terminal</div>
                      <div>Ort</div>
                      <div className="text-right">Preis</div>
                      <div className="text-right">SCU</div>
                      <div className="text-right">Erlös</div>
                    </div>
                    {item.terminals.map((t) => (
                      <div
                        key={t.id}
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_90px_100px_120px] gap-2 border-b border-white/5 px-3 py-2 text-sm last:border-b-0"
                      >
                        <div className="min-w-0 truncate">{t.terminal}</div>
                        <div className="min-w-0 truncate text-xs text-muted-foreground">
                          {[t.system, t.planet].filter(Boolean).join(" · ") || "—"}
                        </div>
                        <div className="text-right font-mono">{fmt(t.price)}</div>
                        <div className="text-right font-mono text-xs">
                          {fmt(t.units)}
                          {t.capped && (
                            <span className="ml-1 text-[10px] text-amber-400">
                              /{fmt(t.stock)}
                            </span>
                          )}
                        </div>
                        <div className="text-right font-mono text-emerald-400">
                          {fmt(t.payout)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}