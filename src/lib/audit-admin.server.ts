import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAppAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

export type AuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_label: string | null;
  org_id: string | null;
  org_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  metadata: string | null;
};

export async function fetchAuditLog(
  userId: string,
  filters: { search?: string; action?: string; orgId?: string; days?: number; limit?: number },
) {
  await assertAppAdmin(userId);

  const days = filters.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("audit_log")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.action) query = query.eq("action", filters.action);
  if (filters.orgId) query = query.eq("org_id", filters.orgId);
  if (filters.search) {
    const s = `%${filters.search}%`;
    query = query.or(
      `summary.ilike.${s},actor_label.ilike.${s},entity_id.ilike.${s},action.ilike.${s}`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const orgIds = [...new Set((data ?? []).map((r) => r.org_id).filter(Boolean))] as string[];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await supabaseAdmin.from("orgs").select("id, name").in("id", orgIds);
    for (const o of orgs ?? []) orgNames.set(o.id, o.name);
  }

  const { data: actionRows } = await supabaseAdmin
    .from("audit_log")
    .select("action")
    .order("created_at", { ascending: false })
    .limit(1000);
  const actions = [...new Set((actionRows ?? []).map((r) => r.action))].sort();

  const entries: AuditRow[] = (data ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    actor_user_id: r.actor_user_id,
    actor_label: r.actor_label,
    org_id: r.org_id,
    org_name: r.org_id ? (orgNames.get(r.org_id) ?? null) : null,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    summary: r.summary,
    metadata: r.metadata && Object.keys(r.metadata as object).length ? JSON.stringify(r.metadata) : null,
  }));

  return { entries, actions };
}

export async function fetchAccessOverview(userId: string) {
  await assertAppAdmin(userId);

  const [authRes, profilesRes, rolesRes, membersRes, orgsRes] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from("profiles").select("id, callsign, display_name"),
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin.from("org_members").select("user_id, org_id, role"),
    supabaseAdmin.from("orgs").select("id, name"),
  ]);

  const nameById = new Map<string, string>();
  for (const p of profilesRes.data ?? [])
    nameById.set(p.id, p.display_name || p.callsign || "—");

  const adminIds = new Set(
    (rolesRes.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
  );
  const orgNameById = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name] as const));
  const orgsByUser = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const list = orgsByUser.get(m.user_id) ?? [];
    list.push(`${orgNameById.get(m.org_id) ?? "?"}${m.role ? ` (${m.role})` : ""}`);
    orgsByUser.set(m.user_id, list);
  }

  const users = (authRes.data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? null,
    name: nameById.get(u.id) ?? u.email ?? "—",
    isAdmin: adminIds.has(u.id),
    banned: Boolean((u as { banned_until?: string | null }).banned_until),
    lastSignInAt: u.last_sign_in_at ?? null,
    createdAt: u.created_at,
    providers: ((u.app_metadata?.providers as string[] | undefined) ?? []).join(", "),
    orgs: orgsByUser.get(u.id) ?? [],
  }));

  users.sort((a, b) => (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? ""));

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return {
    users,
    stats: {
      total: users.length,
      admins: users.filter((u) => u.isAdmin).length,
      banned: users.filter((u) => u.banned).length,
      active24h: users.filter((u) => u.lastSignInAt && Date.parse(u.lastSignInAt) > dayAgo).length,
      active7d: users.filter((u) => u.lastSignInAt && Date.parse(u.lastSignInAt) > weekAgo).length,
      never: users.filter((u) => !u.lastSignInAt).length,
    },
  };
}
