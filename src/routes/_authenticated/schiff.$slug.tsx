import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { shipDetailsQuery, ShipDetailBody } from "@/routes/flotte.$slug";
import { getShipOwners } from "@/lib/fleet.functions";

export const Route = createFileRoute("/_authenticated/schiff/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(shipDetailsQuery(params.slug)),
  component: BackofficeShipDetailPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl py-32 text-sm text-destructive">
      Fehler: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl py-32 text-sm text-muted-foreground">
      Schiff nicht gefunden.
    </div>
  ),
});

function BackofficeShipDetailPage() {
  const { slug } = Route.useParams();
  const fetchOwners = useServerFn(getShipOwners);
  const detailsQ = useSuspenseQuery(shipDetailsQuery(slug));
  const ownersQ = useQuery({
    queryKey: ["ship-owners", slug],
    queryFn: () => fetchOwners({ data: { slug } }),
    staleTime: 60 * 1000,
  });

  const s = detailsQ.data;
  const owners = ownersQ.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/meine-flotte"
        className="mb-6 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-3 w-3" /> Zurück zu meiner Flotte
      </Link>

      {!s ? (
        <div className="py-32 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          // lade Daten…
        </div>
      ) : (
        <ShipDetailBody ship={s} owners={owners} />
      )}
    </div>
  );
}