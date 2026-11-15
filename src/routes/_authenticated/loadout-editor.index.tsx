import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { listShipCatalog } from "@/lib/ship-catalog.functions";
import { listMyBuilds, deleteBuild } from "@/lib/loadout-builds.functions";
import { Trash2, ExternalLink, GitCompare, Info } from "lucide-react";

const catalogQuery = queryOptions({
  queryKey: ["ship-catalog-list"],
  queryFn: () => listShipCatalog(),
  staleTime: 10 * 60 * 1000,
});

export const Route = createFileRoute("/_authenticated/loadout-editor/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQuery).catch(() => undefined),
  head: () => ({ meta: [{ title: "Loadout-Editor — Backoffice" }] }),
  component: LoadoutEditorIndex,
  pendingComponent: () => <LoadingScreen label="Loadout-Editor wird geladen…" />,
});

function LoadoutEditorIndex() {
  const { data: ships } = useSuspenseQuery(catalogQuery);
  const buildsFn = useServerFn(listMyBuilds);
  const { data: builds, refetch } = useQuery({
    queryKey: ["loadout-builds", "mine"],
    queryFn: () => buildsFn(),
  });
  const delFn = useServerFn(deleteBuild);
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loadout-builds"] });
      refetch();
    },
  });

  const [q, setQ] = useState("");
  const flightReady = useMemo(
    () => ships.filter((s) => s.productionStatus === "flight-ready"),
    [ships],
  );
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return flightReady;
    return flightReady.filter(
      (x) =>
        x.name.toLowerCase().includes(s) ||
        (x.manufacturer ?? "").toLowerCase().includes(s),
    );
  }, [flightReady, q]);

  return (
    <PageShell
      title="Loadout-Editor"
      description="Erkul-Style: Hardpoints frei bestücken, DPS & Alpha live berechnen, Builds speichern und teilen."
    >
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">Beta-Hinweis:</span> Der Loadout-Editor befindet sich noch in der aktiven Entwicklung. Berechnungen, Kompatibilitätsdaten und das Teilen von Builds können sich noch ändern.
        </p>
      </div>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl">Meine Builds</h2>
          <div className="flex items-center gap-3">
            <Link
              to="/loadout-editor/compare"
              className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-brand hover:bg-brand/20"
            >
              <GitCompare className="h-3 w-3" /> Builds vergleichen
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {builds?.length ?? 0}
            </span>
          </div>
        </div>
        {!builds || builds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Builds. Wähle unten ein Schiff, um einen neuen Build zu starten.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {builds.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-white/8 bg-card/40 p-4 hover:border-brand/50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/loadout-editor/$slug"
                      params={{ slug: b.ship_slug }}
                      search={{ id: b.id }}
                      className="block font-display text-base truncate hover:text-brand"
                    >
                      {b.name}
                    </Link>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
                      {b.ship_slug} · {new Date(b.updated_at).toLocaleDateString("de-DE")}
                    </div>
                    {b.description && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                        {b.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={`/loadout/${b.share_token}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Öffentliche Ansicht"
                      className="rounded-md border border-white/10 p-1.5 text-muted-foreground hover:text-brand hover:border-brand"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        if (confirm(`Build "${b.name}" löschen?`)) del.mutate(b.id);
                      }}
                      title="Löschen"
                      className="rounded-md border border-white/10 p-1.5 text-muted-foreground hover:text-rose-300 hover:border-rose-400/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">Neuer Build</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Schiff suchen…"
            className="w-full max-w-xs rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <Link
              key={s.slug}
              to="/loadout-editor/$slug"
              params={{ slug: s.slug }}
              className="group flex flex-col overflow-hidden rounded-xl border border-white/8 bg-card/30 hover:border-brand/50 transition"
            >
              {s.image && (
                <div className="aspect-[16/9] overflow-hidden bg-black/40">
                  <img
                    src={s.image}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}
              <div className="p-3">
                <div className="font-display text-sm truncate">{s.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
                  {s.manufacturer ?? "—"} · {s.classificationLabel ?? s.classification ?? "—"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}