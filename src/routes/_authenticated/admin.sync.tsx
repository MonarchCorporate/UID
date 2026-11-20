import { createFileRoute, Link } from "@tanstack/react-router";
import { PatchWatchPanel } from "@/components/admin/PatchWatchPanel";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Wrench,
  Radio,
  Ship as ShipIcon,
  Rocket,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Shirt,
} from "lucide-react";
import {
  syncSccrafterBlueprints,
  getSyncOverview,
} from "@/lib/catalog-sync.functions";
import { syncWikiBlueprints } from "@/lib/blueprints-catalog.functions";
import { syncShipComponents } from "@/lib/ship-components.functions";
import {
  syncShipCatalogFleetyards,
  syncShipPricesWiki,
} from "@/lib/ship-catalog.functions";
import { syncOrgFleetNow } from "@/lib/fleet-sync.functions";
import { syncWikiItems } from "@/lib/items-wiki-sync.functions";
import {
  syncStockLoadouts,
  syncStockLoadoutsWiki,
  getStockLoadoutsOverview,
  syncBespokeFlags,
  getBespokeOverview,
} from "@/lib/stock-loadouts.functions";

export const Route = createFileRoute("/_authenticated/admin/sync")({
  component: SyncPage,
});

type Overview = Awaited<ReturnType<typeof getSyncOverview>>;
type CardKey =
  | "wiki"
  | "sccrafter"
  | "components"
  | "ships"
  | "shipPrices"
  | "fleet"
  | "wikiItems"
  | "stockLoadouts"
  | "stockLoadoutsWiki"
  | "bespoke";

function relTime(iso: string | null): string {
  if (!iso) return "nie";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return "gerade";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `vor ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `vor ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tg.`;
}

function SyncPage() {
  const overviewFn = useServerFn(getSyncOverview);
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["sync-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 15_000,
  });

  const wikiFn = useServerFn(syncWikiBlueprints);
  const sccFn = useServerFn(syncSccrafterBlueprints);
  const compFn = useServerFn(syncShipComponents);
  const shipFn = useServerFn(syncShipCatalogFleetyards);
  const shipPriceFn = useServerFn(syncShipPricesWiki);
  const fleetFn = useServerFn(syncOrgFleetNow);
  const wikiItemsFn = useServerFn(syncWikiItems);
  const stockFn = useServerFn(syncStockLoadouts);
  const stockWikiFn = useServerFn(syncStockLoadoutsWiki);
  const stockOverviewFn = useServerFn(getStockLoadoutsOverview);
  const stockOverview = useQuery({
    queryKey: ["stock-loadouts-overview"],
    queryFn: () => stockOverviewFn(),
    refetchInterval: 30_000,
  });
  const bespokeFn = useServerFn(syncBespokeFlags);
  const bespokeOverviewFn = useServerFn(getBespokeOverview);
  const bespokeOverview = useQuery({
    queryKey: ["bespoke-overview"],
    queryFn: () => bespokeOverviewFn(),
    refetchInterval: 30_000,
  });

  const [runAllStep, setRunAllStep] = useState<CardKey | "done" | null>(null);
  const [runAllLog, setRunAllLog] = useState<
    Array<{ key: CardKey; ok: boolean; note: string }>
  >([]);
  const [busy, setBusy] = useState<CardKey | null>(null);
  const [fyProgress, setFyProgress] = useState<{ page: number; last: number } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["sync-overview"] });

  async function runFleetyardsAll(): Promise<{ ok: boolean; note: string }> {
    let page = 1;
    let totalOk = 0;
    let totalAdded = 0;
    for (let i = 0; i < 60; i++) {
      const r = await shipFn({ data: { page } });
      totalOk += r.ok;
      totalAdded += r.added;
      setFyProgress({ page: r.page, last: r.lastPage });
      if (r.done) break;
      page = r.nextPage ?? r.page + 1;
    }
    setFyProgress(null);
    return { ok: true, note: `${totalOk} akt., ${totalAdded} neu` };
  }

  async function runOne(key: CardKey): Promise<{ ok: boolean; note: string }> {
    try {
      if (key === "wiki") {
        const r = (await wikiFn()) as { blueprint_count?: number; mission_count?: number };
        return {
          ok: true,
          note: `${r.blueprint_count ?? "?"} BPs, ${r.mission_count ?? "?"} Missionen`,
        };
      }
      if (key === "sccrafter") {
        const r = (await sccFn()) as { total?: number; matched?: number };
        return { ok: true, note: `${r.total ?? "?"} gesamt, ${r.matched ?? "?"} verknüpft` };
      }
      if (key === "components") {
        const r = (await compFn()) as { inserted?: number; scanned?: number };
        return { ok: true, note: `${r.inserted ?? "?"} von ${r.scanned ?? "?"} übernommen` };
      }
      if (key === "ships") return await runFleetyardsAll();
      if (key === "shipPrices") {
        const r = (await shipPriceFn()) as {
          matched?: number;
          updated?: number;
          changed?: number;
        };
        return {
          ok: true,
          note: `${r.updated ?? 0} aktualisiert, ${r.changed ?? 0} Preisänderungen`,
        };
      }
      if (key === "fleet") {
        const r = (await fleetFn()) as { ship_count?: number };
        return { ok: true, note: `${r.ship_count ?? "?"} Schiffe` };
      }
      if (key === "wikiItems") {
        const r = (await wikiItemsFn()) as {
          inserted?: number;
          scanned?: number;
        };
        return {
          ok: true,
          note: `${r.inserted ?? "?"} von ${r.scanned ?? "?"} Items`,
        };
      }
      if (key === "stockLoadouts") {
        const r = (await stockFn({ data: {} })) as {
          ok?: number;
          fail?: number;
          total?: number;
          unresolvedCount?: number;
          failed?: Array<{ slug: string; error: string }>;
          unresolved?: Array<{ slug: string; class_name: string }>;
        };
        qc.invalidateQueries({ queryKey: ["stock-loadouts-overview"] });
        if ((r.failed ?? []).length > 0) {
          console.warn("[stock-loadouts] fehlende Schiffe:", r.failed);
        }
        if ((r.unresolved ?? []).length > 0) {
          console.warn(
            "[stock-loadouts] Klassen ohne Katalog-Match (Auszug):",
            r.unresolved,
          );
        }
        const extra = r.unresolvedCount
          ? `, ${r.unresolvedCount} Klassen ohne Match`
          : "";
        return {
          ok: true,
          note: `${r.ok ?? "?"} von ${r.total ?? "?"} Schiffen (${r.fail ?? 0} Fehler${extra})`,
        };
      }
      if (key === "stockLoadoutsWiki") {
        const r = (await stockWikiFn({ data: {} })) as {
          matched?: number;
          written?: number;
          slots?: number;
          resolved?: number;
        };
        qc.invalidateQueries({ queryKey: ["stock-loadouts-overview"] });
        return {
          ok: true,
          note: `${r.written ?? 0} von ${r.matched ?? 0} Schiffen · ${r.slots ?? 0} Slots (${r.resolved ?? 0} gematcht)`,
        };
      }
      if (key === "bespoke") {
        const r = (await bespokeFn()) as {
          shipsFetched?: number;
          bespokeMarked?: number;
          cleared?: number;
          reasonCounts?: Record<string, number>;
        };
        qc.invalidateQueries({ queryKey: ["bespoke-overview"] });
        const parts = Object.entries(r.reasonCounts ?? {})
          .map(([k, v]) => `${k}:${v}`)
          .join(", ");
        return {
          ok: true,
          note: `${r.bespokeMarked ?? 0} markiert, ${r.cleared ?? 0} zurückgesetzt${parts ? ` (${parts})` : ""}`,
        };
      }
      return { ok: false, note: "unbekannt" };
    } catch (e) {
      return { ok: false, note: (e as Error).message };
    }
  }

  const one = useMutation({
    mutationFn: async (key: CardKey) => {
      setBusy(key);
      const r = await runOne(key);
      setBusy(null);
      refresh();
      if (!r.ok) throw new Error(r.note);
      return r;
    },
    onSuccess: (r, key) => toast.success(`${labels[key]}: ${r.note}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const runAll = useMutation({
    mutationFn: async () => {
      setRunAllLog([]);
      const order: CardKey[] = [
        "wikiItems",
        "wiki",
        "sccrafter",
        "components",
        "ships",
        "shipPrices",
        "fleet",
      ];
      for (const key of order) {
        setRunAllStep(key);
        const r = await runOne(key);
        setRunAllLog((l) => [...l, { key, ...r }]);
        refresh();
      }
      setRunAllStep("done");
    },
    onSuccess: () => toast.success("Alle Datenquellen aktualisiert."),
    onError: (e: Error) => toast.error(e.message),
  });

  const data = overview.data;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
          <Link
            to="/admin"
            className="mb-6 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
          >
            ← Admin-Übersicht
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl">Datenquellen aktualisieren</h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                Zentrale Übersicht über alle externen Kataloge. Aktualisiere
                einzelne Quellen oder starte den kompletten Durchlauf.
              </p>
            </div>
            <button
              onClick={() => runAll.mutate()}
              disabled={runAll.isPending}
              className="flex items-center gap-2 border border-brand bg-brand px-6 py-3 font-mono text-[11px] uppercase tracking-[0.3em] text-background hover:bg-brand/90 disabled:opacity-50"
            >
              {runAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {runAll.isPending
                ? `Läuft… ${runAllStep ? labels[runAllStep as CardKey] ?? "" : ""}`
                : "Alles aktualisieren"}
            </button>
          </div>

          <PatchWatchPanel />

          {runAllLog.length > 0 && (
            <div className="mt-6 border border-brand/20 bg-brand/5 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // Sync-Protokoll
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {runAllLog.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {l.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-brand" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-mono text-xs">{labels[l.key]}</span>
                    <span className="text-muted-foreground">— {l.note}</span>
                  </li>
                ))}
                {runAll.isPending && runAllStep && runAllStep !== "done" && (
                  <li className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    <span className="font-mono text-xs">{labels[runAllStep as CardKey]}</span>
                    <span className="text-muted-foreground">
                      — läuft{runAllStep === "ships" && fyProgress
                        ? ` (Seite ${fyProgress.page}/${fyProgress.last})`
                        : ""}
                      …
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card
              icon={Wrench}
              title="Wiki Blueprints & Missionen"
              desc="Blueprints und zugehörige Missionsdaten aus dem Star-Citizen-Wiki."
              count={data?.blueprintsWiki.count}
              extra={
                data
                  ? `${data.missions.count} Missionen`
                  : undefined
              }
              last={data?.blueprintsWiki.last_synced_at ?? null}
              busy={busy === "wiki" || (runAll.isPending && runAllStep === "wiki")}
              onRun={() => one.mutate("wiki")}
            />
            <Card
              icon={Wrench}
              title="SCCrafter Blueprints"
              desc="Community-Blueprints von SCCrafter."
              count={data?.blueprintsScc.count}
              last={data?.blueprintsScc.last_synced_at ?? null}
              busy={busy === "sccrafter" || (runAll.isPending && runAllStep === "sccrafter")}
              onRun={() => one.mutate("sccrafter")}
            />
            <Card
              icon={Radio}
              title="Schiffskomponenten"
              desc="Vehicle-Items (Waffen, Schilde, Antriebe …) aus dem Wiki."
              count={data?.components.count}
              last={data?.components.last_synced_at ?? null}
              busy={busy === "components" || (runAll.isPending && runAllStep === "components")}
              onRun={() => one.mutate("components")}
            />
            <Card
              icon={Shirt}
              title="Wiki-Items (FPS/Charakter)"
              desc="Rüstungen, Helme, FPS-Waffen, Werkzeuge & Consumables inkl. Bildern und Bezugsquellen."
              count={data?.wikiItems?.count}
              last={data?.wikiItems?.last_synced_at ?? null}
              busy={busy === "wikiItems" || (runAll.isPending && runAllStep === "wikiItems")}
              onRun={() => one.mutate("wikiItems")}
            />
            <Card
              icon={ShipIcon}
              title="Schiffskatalog"
              desc="Fleetyards-Stammdaten aller Schiffe (paginiert)."
              count={data?.ships.count}
              last={data?.ships.last_synced_at ?? null}
              busy={busy === "ships" || (runAll.isPending && runAllStep === "ships")}
              onRun={() => one.mutate("ships")}
              extra={
                fyProgress ? `Seite ${fyProgress.page}/${fyProgress.last}` : undefined
              }
            />
            <Card
              icon={ShipIcon}
              title="Schiffspreise (aUEC)"
              desc="Gleicht In-Game-Kaufpreise, Kaufterminals und Mietpreise mit der Star-Citizen-Wiki-API (UEX) ab."
              count={data?.shipPrices?.count ?? data?.ships.count}
              last={data?.shipPrices?.last_synced_at ?? null}
              busy={
                busy === "shipPrices" ||
                (runAll.isPending && runAllStep === "shipPrices")
              }
              onRun={() => one.mutate("shipPrices")}
            />
            <Card
              icon={Rocket}
              title="Orga-Flotte"
              desc="Fleetyards-Flotten aller verknüpften Mitglieder neu einlesen."
              count={data?.fleet.count}
              last={data?.fleet.last_synced_at ?? null}
              extra={
                data?.lastFleetRun
                  ? `Letzter Lauf: ${data.lastFleetRun.status ?? "—"}${data.lastFleetRun.ship_count != null ? ` · ${data.lastFleetRun.ship_count} Schiffe` : ""}`
                  : undefined
              }
              busy={busy === "fleet" || (runAll.isPending && runAllStep === "fleet")}
              onRun={() => one.mutate("fleet")}
            />
            <Card
              icon={ShipIcon}
              title="Standard-Loadouts (scunpacked)"
              desc="Echte Werkskomponenten (Waffen, Schild, Radar, Quantum, Power, Cooler) pro Schiff aus scunpacked."
              count={stockOverview.data?.count}
              last={stockOverview.data?.last_synced_at ?? null}
              busy={
                busy === "stockLoadouts" ||
                (runAll.isPending && runAllStep === "stockLoadouts")
              }
              onRun={() => one.mutate("stockLoadouts")}
            />
            <Card
              icon={ShipIcon}
              title="Standard-Loadouts (Star Citizen Wiki)"
              desc="Werksverbaute Schiffskomponenten direkt aus der Wiki-API (Ports inkl. equipped_item) — Waffen, Turrets, Raketen, Schild, Radar, Quantum, Power, Cooler."
              count={stockOverview.data?.count}
              last={stockOverview.data?.last_synced_at ?? null}
              busy={
                busy === "stockLoadoutsWiki" ||
                (runAll.isPending && runAllStep === "stockLoadoutsWiki")
              }
              onRun={() => one.mutate("stockLoadoutsWiki")}
            />
            <Card
              icon={Radio}
              title="Bespoke-Flags (Kompatibilität)"
              desc="Markiert schiffs-spezifische, nicht tauschbare Komponenten katalogweit — Basis für die Kompatibilitätsprüfung im Loadout-Editor."
              count={bespokeOverview.data?.count}
              last={null}
              busy={
                busy === "bespoke" ||
                (runAll.isPending && runAllStep === "bespoke")
              }
              onRun={() => one.mutate("bespoke")}
            />
          </div>
    </div>
  );
}

const labels: Record<CardKey, string> = {
  wiki: "Wiki Blueprints",
  sccrafter: "SCCrafter",
  components: "Schiffskomponenten",
  ships: "Schiffskatalog",
  shipPrices: "Schiffspreise (aUEC)",
  fleet: "Orga-Flotte",
  wikiItems: "Wiki-Items",
  stockLoadouts: "Standard-Loadouts",
  stockLoadoutsWiki: "Standard-Loadouts (Wiki)",
  bespoke: "Bespoke-Flags",
};

function Card(props: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  count: number | undefined;
  last: string | null;
  busy: boolean;
  onRun: () => void;
  extra?: string;
  runLabel?: string;
}) {
  const Icon = props.icon;
  return (
    <div className="border border-brand/20 p-5">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-brand" />
        <h2 className="font-display text-xl">{props.title}</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{props.desc}</p>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-xs">
        <div>
          <span className="text-muted-foreground">Einträge: </span>
          <span className="text-brand">
            {props.count == null ? "…" : props.count.toLocaleString("de-DE")}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Aktualisiert: </span>
          <span className="text-brand">{relTime(props.last)}</span>
        </div>
        {props.extra && (
          <div className="text-muted-foreground">{props.extra}</div>
        )}
      </div>
      <button
        onClick={props.onRun}
        disabled={props.busy}
        className="mt-4 flex items-center gap-2 border border-brand px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand hover:text-background disabled:opacity-50"
      >
        {props.busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {props.busy ? "läuft…" : props.runLabel ?? "Jetzt aktualisieren"}
      </button>
    </div>
  );
}