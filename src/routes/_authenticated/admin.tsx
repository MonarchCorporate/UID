import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { getMyRoles } from "@/lib/loadouts.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminGuardLayout,
});

/**
 * Gate for every /admin/* route: only the cross-org app admin passes.
 * The admin flag is resolved server-side (`getMyRoles` → has_role), never
 * from client state; each admin server function re-checks independently.
 */
function AdminGuardLayout() {
  const rolesFn = useServerFn(getMyRoles);
  const q = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });

  if (q.isLoading) {
    return (
      <div className="p-12 text-center font-mono text-xs text-muted-foreground">
        // prüfe berechtigung…
      </div>
    );
  }

  if (!q.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-12 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
        <h1 className="font-display text-2xl">Kein Zugriff</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Bereich ist ausschließlich für orgaübergreifende App-Admins.
          Orga-spezifische Einstellungen findest du unter „Orga".
        </p>
        <div className="flex justify-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard">Zum Dashboard</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/orga">Zur Orga</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}