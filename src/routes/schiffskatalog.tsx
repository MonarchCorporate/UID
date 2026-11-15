import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { UidPage } from "@/components/uid/UidPage";
import { listShipCatalog } from "@/lib/ship-catalog.functions";
import { ShipCatalogGrid } from "@/components/ship-catalog/ShipCatalogGrid";

const catalogQuery = queryOptions({
  queryKey: ["ship-catalog-list"],
  queryFn: () => listShipCatalog(),
  staleTime: 10 * 60 * 1000,
});

export const Route = createFileRoute("/schiffskatalog")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQuery),
  head: () => ({
    meta: [
      { title: "Schiffskatalog — MRC Hangar" },
      {
        name: "description",
        content:
          "Vollständiger Schiffskatalog der Monarch Royal Command. Alle bekannten Star-Citizen-Schiffe mit Specs, Hersteller und Klassifikation auf einen Blick.",
      },
      { property: "og:title", content: "Schiffskatalog — MRC Hangar" },
      {
        property: "og:description",
        content:
          "Alle Schiffe im Überblick — durchsuchen, filtern, Detailansicht öffnen.",
      },
    ],
  }),
  component: ShipCatalogPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl px-6 py-32 text-sm text-destructive">
      Fehler: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-32 text-sm text-muted-foreground">
      Nicht gefunden.
    </div>
  ),
});

function ShipCatalogPage() {
  const { data } = useSuspenseQuery(catalogQuery);
  return (
    <UidPage backdrop="stars" seed={3302}>
      <div className="pt-16">
        <section className="mx-auto max-w-7xl px-6">
          <div className="mb-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // database / ships
            </div>
            <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">
              Schiffskatalog
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Alle bekannten Schiffe im Überblick — durchsuchbar, filterbar und mit
              voller Detailansicht. Datenquelle: Fleetyards.
            </p>
          </div>
          <ShipCatalogGrid ships={data} />
        </section>
        <div className="h-32" />
      </div>
    </UidPage>
  );
}
