import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { syncShipCatalogFleetyards } from "@/lib/ship-catalog.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ship-catalog")({
  component: ShipCatalogAdminPage,
});

function ShipCatalogAdminPage() {
  const syncFy = useServerFn(syncShipCatalogFleetyards);
  const [scwResult, setScwResult] = useState<Awaited<ReturnType<typeof syncFy>> | null>(null);
  const [totals, setTotals] = useState({ ok: 0, added: 0, failedCount: 0 });
  const scwM = useMutation({
    mutationFn: (page: number) => syncFy({ data: { page } }),
    onSuccess: (r) => {
      setScwResult(r);
      setTotals((t) => ({
        ok: t.ok + r.ok,
        added: t.added + r.added,
        failedCount: t.failedCount + r.failed.length,
      }));
      if (r.done) {
        toast.success(
          `Fleetyards-Sync abgeschlossen: ${totals.ok + r.ok} aktualisiert, ${totals.added + r.added} neu.`,
        );
      } else {
        toast.success(`Seite ${r.page}/${r.lastPage} fertig — nächste läuft…`);
        window.setTimeout(() => scwM.mutate(r.nextPage ?? r.page + 1), 200);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startSync = () => {
    setTotals({ ok: 0, added: 0, failedCount: 0 });
    setScwResult(null);
    scwM.mutate(1);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
          <Link
            to="/admin"
            className="mb-6 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
          >
            ← Admin-Übersicht
          </Link>
          <h1 className="font-display text-4xl">Schiffskatalog</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Einzige Datenquelle für Schiffsdaten ist{" "}
            <span className="text-brand">Fleetyards</span>. Stammdaten,
            Beschreibungen, Specs, Bilder und Waffen-Hardpoints (RSI Ship
            Matrix) werden synchronisiert.
          </p>

          <div className="mt-8 border border-brand bg-brand/5 p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              // datenquelle
            </div>
            <h2 className="mt-1 font-display text-2xl">Fleetyards Katalog</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Synchronisiert seitenweise alle Schiffe von{" "}
              <code className="text-brand">api.fleetyards.net</code> inkl.
              Hardpoints. Pro Seite werden ~50 Modelle und ihre Hardpoints
              parallel geladen — kann mehrere Minuten dauern.
            </p>
            <button
              onClick={startSync}
              disabled={scwM.isPending}
              className="mt-4 border border-brand bg-brand px-6 py-3 font-mono text-[11px] uppercase tracking-[0.3em] text-background hover:bg-brand/90 disabled:opacity-50"
            >
              {scwM.isPending
                ? `Synchronisiere… Seite ${scwResult?.page ?? 1}${scwResult?.lastPage ? ` / ${scwResult.lastPage}` : ""}`
                : "Fleetyards jetzt synchronisieren"}
            </button>
            {scwResult && (
              <div className="mt-5 border border-brand/20 p-4 text-sm">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                  // {scwResult.done ? "Ergebnis" : "Zwischenstand"}
                </div>
                <p className="mt-1">
                  {totals.ok} aktualisiert, {totals.added} neu hinzugefügt
                  {totals.failedCount > 0 && ` — ${totals.failedCount} Fehler`}.
                </p>
                {scwResult.failed.length > 0 && (
                  <ul className="mt-3 max-h-64 overflow-y-auto text-xs text-muted-foreground">
                    {scwResult.failed.map((f) => (
                      <li key={f.slug}>
                        <span className="font-mono text-brand">{f.slug}</span> — {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
    </div>
  );
}