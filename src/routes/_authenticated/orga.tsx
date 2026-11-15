import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyOrgs } from "@/lib/orgs.functions";
import { useBranding } from "@/components/branding/BrandingProvider";
import React from "react";
import { effectiveOrgPerms, type OrgPerm } from "@/lib/org-perms";


export const Route = createFileRoute("/_authenticated/orga")({
  component: OrgaLayout,
});

/**
 * Convenience hook returning the singleton org id (or null while loading).
 * Kept under the previous name so downstream callers don't need to change.
 */
export function useCurrentOrgId(): [string | null, (id: string | null) => void] {
  const { org, setActiveOrgId } = useBranding();
  return [org?.id ?? null, (id) => id && setActiveOrgId(id)];
}

/**
 * Effective role/permission helper for the active org.
 * UI-only gate — every server function re-checks the permission.
 */
export function useOrgAccess() {
  const { org } = useBranding();
  const perms = effectiveOrgPerms(org?.my_role, org?.my_permissions ?? []);
  const isOwner = org?.my_role === "owner";
  const isOfficer = org?.my_role === "officer";
  return {
    org,
    isOwner,
    isOfficer,
    can: (p: OrgPerm) => isOwner || perms.includes(p),
  };
}

/** Renders children only when the active org grants `perm`. */
export function OrgPermGate({
  perm,
  children,
}: {
  perm: OrgPerm;
  children: React.ReactNode;
}) {
  const { can } = useOrgAccess();
  if (!can(perm)) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="font-display text-lg">Kein Zugriff</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Dir fehlt die Berechtigung für diesen Bereich. Wende dich an die
          Orgaleitung.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function OrgaLayout() {
  const listFn = useServerFn(listMyOrgs);
  const { data, isLoading } = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => listFn(),
  });
  const orgs = data?.orgs ?? [];
  const { org: activeOrg } = useBranding();
  const current = orgs.find((o) => o.id === activeOrg?.id) ?? orgs[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-brand/10 pb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
            // organisation
          </div>
          <h1 className="font-display text-3xl">
            {current?.name ?? "Orgaverwaltung"}
          </h1>
          {current?.tag && (
            <div className="font-mono text-xs text-muted-foreground">
              [{current.tag}] · {current.member_count} Mitglieder · Rolle:{" "}
              {current.my_role}
            </div>
          )}
        </div>
      </header>

      <div className="min-w-0">
        {isLoading ? (
          <div className="p-12 text-center font-mono text-xs text-muted-foreground">
            // lade…
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
}
