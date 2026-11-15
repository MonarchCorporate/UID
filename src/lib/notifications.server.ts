// Notification fanout helper. Server-only (uses supabaseAdmin). Import
// dynamically from inside server-function handlers to keep it out of the
// client bundle.

import { rolePresetPerms, type OrgPerm } from "@/lib/org-perms";

export type NotificationPayload = {
  org_id: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  ref_table?: string | null;
  ref_id?: string | null;
};

/**
 * Bulk-insert one notification per org member that holds any of the given
 * permissions (via preset role or explicit `permissions[]`). The `exclude`
 * user (usually the trigger's actor) is skipped. Owners always receive.
 *
 * Best-effort: swallows errors and logs. Never let a notification failure
 * break the primary action.
 */
export async function fanoutToOrgPerm(
  orgId: string,
  perms: OrgPerm[],
  payload: Omit<NotificationPayload, "org_id">,
  exclude?: string | null,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: members, error } = await supabaseAdmin
      .from("org_members")
      .select("user_id, role, permissions, custom_role_id")
      .eq("org_id", orgId);
    if (error || !members?.length) return;

    const targets = new Set<string>();
    const roleByUser = new Map<string, string>();
    for (const m of members) {
      const uid = m.user_id as string;
      if (!uid || uid === exclude) continue;
      const role = (m.role ?? "") as string;
      const customRoleId = (m as { custom_role_id?: string | null })
        .custom_role_id ?? null;
      // Role key used for role-based settings: custom role id if present,
      // otherwise the preset role name.
      const roleKey = customRoleId ? `custom:${customRoleId}` : role;
      if (role === "owner") {
        targets.add(uid);
        roleByUser.set(uid, roleKey);
        continue;
      }
      const preset = rolePresetPerms(role);
      const explicit = (m.permissions ?? []) as string[];
      if (perms.some((p) => preset.includes(p) || explicit.includes(p))) {
        targets.add(uid);
        roleByUser.set(uid, roleKey);
      }
    }
    if (targets.size === 0) return;

    // Role-based opt-out: if a row exists for (org, role, kind) with
    // enabled=false, skip every member of that role. Owners are never
    // filtered by role settings.
    const { data: roleRows } = await supabaseAdmin
      .from("notification_role_settings")
      .select("role_key, enabled")
      .eq("org_id", orgId)
      .eq("kind", payload.kind);
    const disabledRoles = new Set(
      (roleRows ?? [])
        .filter((r) => r.enabled === false)
        .map((r) => r.role_key as string),
    );
    const roleFiltered: string[] = [];
    for (const uid of targets) {
      const rk = roleByUser.get(uid) ?? "";
      // Never mute owners via role settings.
      const memberRole = members.find((m) => m.user_id === uid)?.role;
      if (memberRole === "owner") {
        roleFiltered.push(uid);
        continue;
      }
      if (disabledRoles.has(rk)) continue;
      roleFiltered.push(uid);
    }
    if (roleFiltered.length === 0) return;

    // Respect per-user opt-out preferences for this notification kind.
    const targetIds = roleFiltered;
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("user_id, enabled")
      .eq("kind", payload.kind)
      .in("user_id", targetIds);
    const disabled = new Set(
      (prefs ?? [])
        .filter((p) => p.enabled === false)
        .map((p) => p.user_id as string),
    );
    const finalIds = targetIds.filter((id) => !disabled.has(id));
    if (finalIds.length === 0) return;

    const rows = finalIds.map((user_id) => ({
      user_id,
      org_id: orgId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body ?? null,
      link: payload.link ?? null,
      ref_table: payload.ref_table ?? null,
      ref_id: payload.ref_id ?? null,
    }));
    await supabaseAdmin.from("notifications").insert(rows);
  } catch (err) {
    console.error("[notifications] fanout failed:", err);
  }
}