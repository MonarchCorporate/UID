import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyOrgs } from "@/lib/orgs.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { PageHint } from "@/components/orga/PageHint";
import { useBranding } from "@/components/branding/BrandingProvider";

export const Route = createFileRoute("/_authenticated/orga/")({
  component: OrgOverview,
});

function OrgOverview() {
  const listFn = useServerFn(listMyOrgs);
  const { data } = useQuery({ queryKey: ["my-orgs"], queryFn: () => listFn() });
  const orgs = data?.orgs ?? [];
  const { org: activeOrg } = useBranding();

  if (orgs.length === 0) {
    return (
      <div className="border border-dashed border-brand/20 p-10 text-center">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Orga wird vorbereitet…
        </p>
      </div>
    );
  }

  const current = orgs.find((o) => o.id === activeOrg?.id) ?? orgs[0];

  return (
    <div className="space-y-4">
      <PageHint>
        Willkommen in der Orga-Übersicht. Hier siehst du auf einen Blick die
        wichtigsten Informationen und hast Schnellzugriff auf Lager, Kasse,
        Mitglieder und Einstellungen.
      </PageHint>

      <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{current.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Mitglieder:</span>{" "}
            {current.member_count}
          </div>
          <div>
            <span className="text-muted-foreground">Deine Rolle:</span>{" "}
            <span className="font-mono">{current.my_role}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Gegründet:</span>{" "}
            {new Date(current.created_at).toLocaleDateString("de-DE")}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Schnellzugriff</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/orga/lager">Orgalager öffnen</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/orga/kasse">Orgakasse öffnen</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/orga/shop">Shop verwalten</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/orga/mitglieder">Mitglieder verwalten</Link>
          </Button>
          {(current.my_role === "owner" || current.my_role === "officer") && (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/orgs">Orga-Einstellungen &amp; Branding</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  </div>
);
}