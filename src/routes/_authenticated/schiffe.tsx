import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { listShipCatalog } from "@/lib/ship-catalog.functions";
import { ShipCatalogGrid } from "@/components/ship-catalog/ShipCatalogGrid";

const catalogQuery = queryOptions({
  queryKey: ["ship-catalog-list"],
  queryFn: () => listShipCatalog(),
  staleTime: 10 * 60 * 1000,
});

export const Route = createFileRoute("/_authenticated/schiffe")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  head: () => ({ meta: [{ title: "Schiffskatalog — Backoffice" }] }),
  component: BackofficeShipCatalog,
  pendingComponent: () => <LoadingScreen label="Schiffskatalog wird geladen…" />,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Fehler: {error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Nicht gefunden.</div>
  ),
});

function BackofficeShipCatalog() {
  const { data } = useSuspenseQuery(catalogQuery);
  return (
    <PageShell
      title="Schiffskatalog"
      description="Alle bekannten Star-Citizen-Schiffe — durchsuchbar, filterbar, vergleichbar."
    >
      <ShipCatalogGrid ships={data} />
    </PageShell>
  );
}