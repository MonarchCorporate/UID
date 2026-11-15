import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { logAudit } from "@/lib/audit.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

export const getAdminOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Nur Admins.");

    const [usersRes, shipsRes, userShipsRes, activeBoardsRes, activeMissionsRes, adminTplRes] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("fleet_ships").select("slug", { count: "exact", head: true }),
        supabaseAdmin.from("user_ships").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("board_sessions")
          .select("id", { count: "exact", head: true })
          .in("status", ["in_flight", "docked"]),
        supabaseAdmin
          .from("missions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabaseAdmin
          .from("ship_loadout_templates")
          .select("id", { count: "exact", head: true })
          .eq("scope", "admin"),
      ]);

    return {
      users: usersRes.count ?? 0,
      fleetShips: shipsRes.count ?? 0,
      userShips: userShipsRes.count ?? 0,
      activeBoards: activeBoardsRes.count ?? 0,
      activeMissions: activeMissionsRes.count ?? 0,
      adminTemplates: adminTplRes.count ?? 0,
    };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [profilesRes, rolesRes, authRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, callsign, display_name, fleetyards_username, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const emailById = new Map<string, string | undefined>();
    for (const u of authRes.data?.users ?? []) emailById.set(u.id, u.email ?? undefined);

    const rolesById = new Map<string, string[]>();
    for (const r of rolesRes.data ?? []) {
      const list = rolesById.get(r.user_id) ?? [];
      list.push(r.role);
      rolesById.set(r.user_id, list);
    }

    return (profilesRes.data ?? []).map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? null,
      callsign: p.callsign,
      display_name: p.display_name,
      fleetyards_username: p.fleetyards_username,
      created_at: p.created_at,
      roles: rolesById.get(p.id) ?? [],
      banned_until:
        (authRes.data?.users.find((u) => u.id === p.id) as { banned_until?: string | null } | undefined)
          ?.banned_until ?? null,
    }));
  });

export const updateUserProfileAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        display_name: z.string().min(1).max(120).nullable().optional(),
        callsign: z.string().min(1).max(60),
        fleetyards_username: z.string().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        display_name: data.display_name ?? null,
        callsign: data.callsign,
        fleetyards_username: data.fleetyards_username ?? null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    await logAudit({
      actorUserId: context.userId,
      action: "user.profile_updated",
      entityType: "user",
      entityId: data.userId,
      summary: `Profil von ${data.callsign} bearbeitet`,
      metadata: { callsign: data.callsign, display_name: data.display_name ?? null },
    });
    return { ok: true };
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), isAdmin: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.isAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    await logAudit({
      actorUserId: context.userId,
      action: data.isAdmin ? "user.admin_granted" : "user.admin_revoked",
      entityType: "user",
      entityId: data.userId,
      summary: data.isAdmin ? "App-Admin-Rolle vergeben" : "App-Admin-Rolle entzogen",
    });
    return { ok: true };
  });

export const createUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(128),
        callsign: z.string().trim().min(1).max(60),
        display_name: z.string().trim().min(1).max(120).optional(),
        fleetyards_username: z.string().trim().max(120).optional(),
        isAdmin: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        callsign: data.callsign,
        display_name: data.display_name ?? data.callsign,
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Konnte Nutzer nicht erstellen.");

    // handle_new_user-Trigger legt das Profil an; Felder ggf. nachziehen.
    await supabaseAdmin
      .from("profiles")
      .update({
        callsign: data.callsign,
        display_name: data.display_name ?? data.callsign,
        fleetyards_username: data.fleetyards_username || null,
      })
      .eq("id", created.user.id);

    if (data.isAdmin) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
    }
    await logAudit({
      actorUserId: context.userId,
      action: "user.created",
      entityType: "user",
      entityId: created.user.id,
      summary: `Account ${data.callsign} (${data.email}) erstellt`,
      metadata: { isAdmin: Boolean(data.isAdmin) },
    });
    return { ok: true, userId: created.user.id };
  });

export const updateUserEmailAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await logAudit({
      actorUserId: context.userId,
      action: "user.email_changed",
      entityType: "user",
      entityId: data.userId,
      summary: `E-Mail geändert auf ${data.email}`,
    });
    return { ok: true };
  });

export const updateUserPasswordAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await logAudit({
      actorUserId: context.userId,
      action: "user.password_reset",
      entityType: "user",
      entityId: data.userId,
      summary: "Passwort durch Admin gesetzt",
    });
    return { ok: true };
  });

export const setUserBannedAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) throw new Error("Du kannst dich nicht selbst sperren.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      // 100 Jahre = effektiv dauerhaft sperren; "none" hebt die Sperre auf.
      ban_duration: data.banned ? "876000h" : "none",
    } as { ban_duration: string });
    if (error) throw new Error(error.message);
    await logAudit({
      actorUserId: context.userId,
      action: data.banned ? "user.banned" : "user.unbanned",
      entityType: "user",
      entityId: data.userId,
      summary: data.banned ? "Zugang gesperrt" : "Sperre aufgehoben",
    });
    return { ok: true };
  });