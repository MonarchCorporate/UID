import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationRow = {
  id: string;
  org_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  ref_table: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("notifications")
      .select("id, org_id, kind, title, body, link, ref_table, ref_id, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as NotificationRow[] };
  });

export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ ids: z.array(z.string().uuid()).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    let q = context.supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (data.ids && data.ids.length > 0) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const NOTIFICATION_KINDS = [
  {
    kind: "warehouse.release_request",
    label: "Neue Lager-Anfrage",
    description: "Ein Mitglied möchte ein Item aus dem Orgalager entnehmen.",
  },
  {
    kind: "warehouse.offer",
    label: "Neue Lager-Spende",
    description: "Ein Mitglied bietet ein Item für das Orgalager an.",
  },
  {
    kind: "treasury.request",
    label: "Neue Kassen-Anfrage",
    description: "Ein Mitglied stellt einen Antrag an die Orgakasse.",
  },
  {
    kind: "shop.reservation.new",
    label: "Neue Shop-Reservierung",
    description: "Ein Kunde hat ein Item im öffentlichen Shop reserviert.",
  },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]["kind"];

export const listNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_preferences")
      .select("kind, enabled")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const map: Record<string, boolean> = {};
    for (const row of data ?? []) map[row.kind as string] = row.enabled !== false;
    // Default: enabled when no row exists.
    const prefs = NOTIFICATION_KINDS.map((k) => ({
      kind: k.kind,
      enabled: map[k.kind] ?? true,
    }));
    return { prefs };
  });

export const setNotificationPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ kind: z.string().min(1), enabled: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: context.userId,
          kind: data.kind,
          enabled: data.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,kind" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Role-based notification settings ----------

export type RoleOption = {
  key: string; // preset name or "custom:<uuid>"
  label: string;
  color?: string | null;
  isCustom: boolean;
};

export const PRESET_ROLE_KEYS: { key: string; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "officer", label: "Officer" },
  { key: "quartermaster", label: "Quartermaster" },
  { key: "treasurer", label: "Treasurer" },
  { key: "member", label: "Mitglied" },
];

export const listRoleNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orgId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS enforces org membership for read.
    const [{ data: custom, error: cErr }, { data: rows, error: rErr }] =
      await Promise.all([
        context.supabase
          .from("org_custom_roles")
          .select("id, name, color")
          .eq("org_id", data.orgId)
          .order("name"),
        context.supabase
          .from("notification_role_settings")
          .select("role_key, kind, enabled")
          .eq("org_id", data.orgId),
      ]);
    if (cErr) throw new Error(cErr.message);
    if (rErr) throw new Error(rErr.message);
    const roles: RoleOption[] = [
      ...PRESET_ROLE_KEYS.map((r) => ({
        key: r.key,
        label: r.label,
        isCustom: false,
      })),
      ...(custom ?? []).map((r) => ({
        key: `custom:${r.id as string}`,
        label: r.name as string,
        color: (r.color as string | null) ?? null,
        isCustom: true,
      })),
    ];
    const settings: Record<string, Record<string, boolean>> = {};
    for (const row of rows ?? []) {
      const rk = row.role_key as string;
      const kd = row.kind as string;
      if (!settings[rk]) settings[rk] = {};
      settings[rk][kd] = row.enabled !== false;
    }
    return { roles, settings };
  });

export const setRoleNotificationSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        roleKey: z.string().min(1),
        kind: z.string().min(1),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS enforces `members.manage` permission via has_org_perm.
    const { error } = await context.supabase
      .from("notification_role_settings")
      .upsert(
        {
          org_id: data.orgId,
          role_key: data.roleKey,
          kind: data.kind,
          enabled: data.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,role_key,kind" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });