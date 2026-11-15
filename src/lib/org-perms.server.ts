import type { OrgPerm } from "./org-perms";
import { effectiveOrgPerms } from "./org-perms";

/**
 * Returns true if `userId` has `perm` in ANY org they belong to.
 * App-admins and org-owners always pass.
 *
 * Pass a Supabase admin client (service role) — this helper is meant for
 * server-side authorization inside server functions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function userHasAnyOrgPerm(admin: any, userId: string, perm: OrgPerm): Promise<boolean> {
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (isAdmin) return true;
  const { data: rows } = await admin
    .from("org_members")
    .select("role, permissions, org_custom_roles:custom_role_id(permissions)")
    .eq("user_id", userId);
  for (const m of rows ?? []) {
    if (m.role === "owner") return true;
    const customPerms =
      (m.org_custom_roles as { permissions: string[] } | null)?.permissions ?? [];
    const eff = effectiveOrgPerms(m.role, [
      ...((m.permissions as string[] | null) ?? []),
      ...customPerms,
    ]);
    if (eff.includes(perm)) return true;
  }
  return false;
}

/** Same as above but restricted to a specific org. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function userHasOrgPerm(admin: any, userId: string, orgId: string, perm: OrgPerm): Promise<boolean> {
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (isAdmin) return true;
  const { data: m } = await admin
    .from("org_members")
    .select("role, permissions, org_custom_roles:custom_role_id(permissions)")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) return false;
  if (m.role === "owner") return true;
  const customPerms =
    (m.org_custom_roles as { permissions: string[] } | null)?.permissions ?? [];
  const eff = effectiveOrgPerms(m.role, [
    ...((m.permissions as string[] | null) ?? []),
    ...customPerms,
  ]);
  return eff.includes(perm);
}
