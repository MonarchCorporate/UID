import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  listMyBuilds,
  getBuild,
  getComponentsByRefs,
  type LoadoutBuild,
} from "@/lib/loadout-builds.functions";
import {
  summarizeLoadout,
  sustainedSummary,
  DEFAULT_MODE,
  type ComponentPick,
  type FlightMode,
} from "@/lib/loadout/domain";
import { FlightModePanel } from "@/components/loadouts/FlightModePanel";
import { fmt } from "@/lib/loadout-calc";
import { ArrowLeft, GitCompare, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/loadout-editor/compare")({
  head: () => ({ meta: [{ title: "Build-Vergleich — Loadout-Editor" }] }),
  component: CompareBuildsPage,
  pendingComponent: () => <LoadingScreen label="Vergleich wird geladen…" />,
});

const MAX_COMPARE = 4;

function CompareBuildsPage() {
  const listFn = useServerFn(listMyBuilds);
  const { data: builds, isLoading } = useQuery({
    queryKey: ["loadout-builds", "mine"],
    queryFn: () => listFn(),
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<FlightMode>(DEFAULT_MODE);

  // Preselect first two builds after they load.
  useEffect(() => {
    if (!builds || selected.length > 0) return;
    setSelected(builds.slice(0, 2).map((b) => b.id));
  }, [builds, selected.length]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  return (
    <PageShell
      title="Build-Vergleich"
      description="Bis zu vier Builds nebeneinander auswerten – Damage, Defense, Energie, Kühlung, Simulation."
    >
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/loadout-editor"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:border-brand hover:text-brand"
        >
          <ArrowLeft className="h-3 w-3" /> Zurück zur Übersicht
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {selected.length} / {MAX_COMPARE} ausgewählt
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade Builds…</p>
      ) : !builds || builds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Builds vorhanden – erst einen Build im Editor speichern.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left: build picker + mode */}
          <div className="space-y-4">
            <div className="rounded-xl border border-white/8 bg-card/40 p-3">
              <div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <GitCompare className="h-3 w-3" /> Builds
              </div>
              <div className="max-h-[520px] space-y-1 overflow-auto pr-1">
                {builds.map((b) => {
                  const isOn = selected.includes(b.id);
                  const disabled = !isOn && selected.length >= MAX_COMPARE;
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b.id)}
                      disabled={disabled}
                      className={`w-full rounded-md border px-2.5 py-2 text-left text-xs transition ${
                        isOn
                          ? "border-brand bg-brand/10 text-brand"
                          : disabled
                          ? "cursor-not-allowed border-white/5 bg-background/30 text-muted-foreground/60"
                          : "border-white/10 bg-background/40 text-foreground hover:border-brand/40"
                      }`}
                    >
                      <div className="truncate font-display text-sm">{b.name}</div>
                      <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                        {b.ship_slug}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-card/40 p-3">
              <div className="mb-2 border-b border-white/5 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Flight Mode (angewendet auf alle Spalten)
              </div>
              <FlightModePanel mode={mode} onChange={setMode} />
            </div>
          </div>

          {/* Right: comparison matrix */}
          <CompareMatrix ids={selected} mode={mode} />
        </div>
      )}
    </PageShell>
  );
}

function CompareMatrix({ ids, mode }: { ids: string[]; mode: FlightMode }) {
  const buildFn = useServerFn(getBuild);
  const compsFn = useServerFn(getComponentsByRefs);

  const buildQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["build", id],
      queryFn: () => buildFn({ data: { id } }),
      staleTime: 60_000,
    })),
  });

  const loadedBuilds = buildQueries
    .map((q) => q.data)
    .filter((b): b is LoadoutBuild => !!b);

  const allRefs = useMemo(() => {
    const set = new Set<string>();
    for (const b of loadedBuilds) {
      for (const s of b.slots ?? []) {
        if (s.item_ref) set.add(s.item_ref);
      }
    }
    return Array.from(set);
  }, [loadedBuilds]);

  const { data: comps } = useQuery({
    queryKey: ["compare-components", allRefs.slice().sort().join("|")],
    queryFn: () => compsFn({ data: { refs: allRefs } }),
    enabled: allRefs.length > 0,
    staleTime: 60_000,
  });

  const compsMap = useMemo(() => {
    const m = new Map<string, { name: string; category: string | null; size: number | null; raw: unknown }>();
    for (const c of comps ?? []) m.set(c.item_ref, c);
    return m;
  }, [comps]);

  const columns = useMemo(() => {
    return loadedBuilds.map((b) => {
      const picks: ComponentPick[] = (b.slots ?? []).map((s) => {
        const c = s.item_ref ? compsMap.get(s.item_ref) : undefined;
        return {
          slot_key: s.slot_key,
          item_ref: s.item_ref,
          name: c?.name ?? null,
          category: (c?.category ?? s.category) ?? null,
          size: c?.size ?? s.size ?? null,
          raw: c?.raw ?? null,
        };
      });
      const summary = summarizeLoadout(picks, { mode });
      const sim = sustainedSummary(picks, { durationSeconds: 60, stepSeconds: 0.1 });
      return { build: b, picks, summary, sim };
    });
  }, [loadedBuilds, compsMap, mode]);

  if (ids.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-card/20 p-10 text-center text-sm text-muted-foreground">
        Links Builds auswählen, um sie zu vergleichen.
      </div>
    );
  }
  if (buildQueries.some((q) => q.isLoading)) {
    return <p className="text-sm text-muted-foreground">Lade ausgewählte Builds…</p>;
  }

  const rows = buildRows();

  return (
    <div className="overflow-auto rounded-xl border border-white/8 bg-card/40">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-white/10 bg-background/40">
            <th className="sticky left-0 z-10 bg-background/40 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Metrik
            </th>
            {columns.map((c) => (
              <th key={c.build.id} className="min-w-[160px] px-3 py-2 text-left">
                <div className="truncate font-display text-sm text-foreground">{c.build.name}</div>
                <div className="truncate font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                  {c.build.ship_slug}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = columns.map((c) => row.get(c));
            const winnerIdx = row.higherIsBetter
              ? argMax(values)
              : row.higherIsBetter === false
              ? argMin(values)
              : -1;
            return (
              <tr key={row.label} className="border-b border-white/5 last:border-0">
                <td className="sticky left-0 z-10 bg-card/60 px-3 py-1.5 text-muted-foreground">
                  <div>{row.label}</div>
                  {row.hint && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60">
                      {row.hint}
                    </div>
                  )}
                </td>
                {values.map((v, i) => (
                  <td
                    key={i}
                    className={`px-3 py-1.5 font-mono tabular-nums ${
                      i === winnerIdx ? "text-brand" : "text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {i === winnerIdx && v !== 0 && <Crown className="h-3 w-3 text-brand" />}
                      {row.format(v)}
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Column = ReturnType<typeof buildColumnsShape>;
// Just to give TS a nominal type for row.get(...); we use the columns[] type from CompareMatrix.
function buildColumnsShape() {
  return {
    build: null as unknown as LoadoutBuild,
    picks: [] as ComponentPick[],
    summary: null as unknown as ReturnType<typeof summarizeLoadout>,
    sim: null as unknown as ReturnType<typeof sustainedSummary>,
  };
}

type Row = {
  label: string;
  hint?: string;
  higherIsBetter?: boolean; // omitted → no highlight
  format: (v: number) => string;
  get: (c: Column) => number;
};

function buildRows(): Row[] {
  const num = (v: number) => fmt(v);
  const pct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)} %` : "∞");
  const sec = (v: number) => (v > 0 ? `${v.toFixed(1)} s` : "—");
  return [
    // Damage
    { label: "Σ Alpha", higherIsBetter: true, format: num, get: (c) => c.summary.weapons.totalAlpha },
    { label: "Burst DPS", higherIsBetter: true, format: num, get: (c) => c.summary.weapons.totalBurstDps },
    { label: "Sustained DPS", hint: "60 s Simulation", higherIsBetter: true, format: num, get: (c) => c.sim.sustainedDps },
    { label: "Peak DPS", higherIsBetter: true, format: num, get: (c) => c.sim.peakDps },
    { label: "Time-to-empty", hint: "Bis 1. Reload", higherIsBetter: true, format: sec, get: (c) => c.sim.timeToFirstEmpty },
    { label: "Waffen", higherIsBetter: true, format: (v) => String(v), get: (c) => c.summary.weapons.weaponCount },
    { label: "Physisch DPS", higherIsBetter: true, format: num, get: (c) => c.summary.weapons.burstDpsByType.physical },
    { label: "Energie DPS", higherIsBetter: true, format: num, get: (c) => c.summary.weapons.burstDpsByType.energy },
    { label: "Distortion DPS", higherIsBetter: true, format: num, get: (c) => c.summary.weapons.burstDpsByType.distortion },
    { label: "Thermal DPS", higherIsBetter: true, format: num, get: (c) => c.summary.weapons.burstDpsByType.thermal },
    // Missiles
    { label: "Raketen Σ Schaden", higherIsBetter: true, format: num, get: (c) => c.summary.missiles.missileDamage },
    // Shields
    { label: "Shield HP", higherIsBetter: true, format: num, get: (c) => c.summary.shields.totalCapacity },
    { label: "Shield Regen", higherIsBetter: true, format: num, get: (c) => c.summary.shields.totalRegen },
    { label: "Full Recharge", higherIsBetter: false, format: sec, get: (c) => c.summary.shields.timeToFullRecharge },
    // Power
    { label: "Power verfügbar", higherIsBetter: true, format: num, get: (c) => c.summary.power.available },
    { label: "Power Bedarf", higherIsBetter: false, format: num, get: (c) => c.summary.power.required },
    { label: "Power Auslastung", higherIsBetter: false, format: pct, get: (c) => c.summary.power.usagePercent },
    // Cooling
    { label: "Cooling verfügbar", higherIsBetter: true, format: num, get: (c) => c.summary.cooling.available },
    { label: "Cooling Auslastung", higherIsBetter: false, format: pct, get: (c) => c.summary.cooling.usagePercent },
    // Signatures
    { label: "EM Signatur", higherIsBetter: false, format: num, get: (c) => c.summary.signatures.em },
    { label: "IR Signatur", higherIsBetter: false, format: num, get: (c) => c.summary.signatures.ir },
    // Quantum
    { label: "Quantum km/s", higherIsBetter: true, format: (v) => (v > 0 ? fmt(v / 1000) : "—"), get: (c) => c.summary.quantum?.quantumSpeed ?? 0 },
    { label: "Quantum Range km", higherIsBetter: true, format: (v) => (v > 0 ? fmt(v / 1000) : "—"), get: (c) => c.summary.quantum?.maxRange ?? 0 },
  ];
}

function argMax(vals: number[]): number {
  let best = -1;
  let bestV = -Infinity;
  vals.forEach((v, i) => {
    if (Number.isFinite(v) && v > bestV) {
      bestV = v;
      best = i;
    }
  });
  // No winner if all zero.
  if (bestV <= 0) return -1;
  // No winner if there's a tie for max.
  if (vals.filter((v) => v === bestV).length > 1) return -1;
  return best;
}

function argMin(vals: number[]): number {
  let best = -1;
  let bestV = Infinity;
  vals.forEach((v, i) => {
    if (Number.isFinite(v) && v > 0 && v < bestV) {
      bestV = v;
      best = i;
    }
  });
  if (!Number.isFinite(bestV)) return -1;
  if (vals.filter((v) => v === bestV).length > 1) return -1;
  return best;
}