import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Wie viele eigene Discord-Rollen eine Orga maximal anlegen darf. */
export const ORG_ROLE_QUOTA = 15;

async function assertRoleManager(userId: string, orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { userHasOrgPerm } = await import("@/lib/org-perms.server");
  const ok = await userHasOrgPerm(supabaseAdmin, userId, orgId, "discord.roles");
  if (!ok) throw new Error("Keine Berechtigung, Discord-Rollen dieser Orga zu verwalten.");
  return supabaseAdmin;
}

export type OrgRoleState = {
  error: string | null;
  quota: number;
  /** Selbst angelegte Rollen – bearbeitbar & löschbar. */
  managed: {
    id: string;
    discord_role_id: string;
    name: string;
    color: number;
    hoist: boolean;
    mentionable: boolean;
    exists: boolean;
  }[];
  /** Vom App-Admin zugeteilte Rollen – nur vergebbar. */
  assigned: { discord_role_id: string; name: string; color: number; is_lead: boolean }[];
  members: {
    user_id: string;
    name: string;
    discord_user_id: string | null;
    discord_username: string | null;
    onGuild: boolean;
    role_ids: string[];
  }[];
};

/** Alles für die Rollenverwaltung einer Orga in einem Aufruf. */
export const getOrgRoleState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ org_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<OrgRoleState> => {
    const supabaseAdmin = await assertRoleManager(context.userId, data.org_id);

    const [{ data: managedRows }, { data: mappings }, { data: memberRows }] =
      await Promise.all([
        supabaseAdmin
          .from("discord_managed_roles")
          .select("id, discord_role_id, name, color, hoist, mentionable")
          .eq("org_id", data.org_id)
          .order("name"),
        supabaseAdmin
          .from("discord_role_mappings")
          .select("discord_role_id, discord_role_name, discord_role_color, is_lead")
          .eq("org_id", data.org_id)
          .eq("enabled", true)
          .order("discord_role_name"),
        supabaseAdmin
          .from("org_members")
          .select("user_id")
          .eq("org_id", data.org_id),
      ]);

    const userIds = (memberRows ?? []).map((m) => m.user_id as string);
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, callsign, display_name, discord_user_id, discord_username")
          .in("id", userIds)
      : { data: [] as Record<string, unknown>[] };

    let error: string | null = null;
    let liveRoleIds = new Set<string>();
    const rolesByUser = new Map<string, string[]>();

    try {
      const { fetchGuildRoles, fetchMemberRoles } = await import("@/lib/discord.server");
      liveRoleIds = new Set((await fetchGuildRoles()).map((r) => r.id));

      const withDiscord = (profiles ?? []).filter((p) => p.discord_user_id);
      for (let i = 0; i < withDiscord.length; i += 5) {
        const slice = withDiscord.slice(i, i + 5);
        await Promise.all(
          slice.map(async (p) => {
            const ids = await fetchMemberRoles(p.discord_user_id as string).catch(() => null);
            if (ids) rolesByUser.set(p.id as string, ids);
          }),
        );
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      error,
      quota: ORG_ROLE_QUOTA,
      managed: (managedRows ?? []).map((r) => ({
        id: r.id as string,
        discord_role_id: r.discord_role_id as string,
        name: r.name as string,
        color: (r.color as number) ?? 0,
        hoist: !!r.hoist,
        mentionable: !!r.mentionable,
        exists: liveRoleIds.size === 0 || liveRoleIds.has(r.discord_role_id as string),
      })),
      assigned: (mappings ?? []).map((m) => ({
        discord_role_id: m.discord_role_id as string,
        name: m.discord_role_name as string,
        color: (m.discord_role_color as number) ?? 0,
        is_lead: !!m.is_lead,
      })),
      members: (profiles ?? [])
        .map((p) => ({
          user_id: p.id as string,
          name: (p.display_name as string) || (p.callsign as string) || "Unbekannt",
          discord_user_id: (p.discord_user_id as string) ?? null,
          discord_username: (p.discord_username as string) ?? null,
          onGuild: rolesByUser.has(p.id as string),
          role_ids: rolesByUser.get(p.id as string) ?? [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

const roleInput = z.object({
  org_id: z.string().uuid(),
  name: z.string().trim().min(2).max(90),
  color: z.number().int().min(0).max(0xffffff).default(0),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
});

/** Legt eine neue Discord-Rolle für die Orga an. */
export const createOrgDiscordRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => roleInput.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertRoleManager(context.userId, data.org_id);

    const { count } = await supabaseAdmin
      .from("discord_managed_roles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", data.org_id);
    if ((count ?? 0) >= ORG_ROLE_QUOTA) {
      throw new Error(`Limit erreicht: maximal ${ORG_ROLE_QUOTA} eigene Rollen.`);
    }

    const { createGuildRole } = await import("@/lib/discord.server");
    const role = await createGuildRole({
      name: data.name,
      color: data.color,
      hoist: data.hoist,
      mentionable: data.mentionable,
    });

    const { error } = await supabaseAdmin.from("discord_managed_roles").insert({
      org_id: data.org_id,
      discord_role_id: role.id,
      name: data.name,
      color: data.color,
      hoist: data.hoist,
      mentionable: data.mentionable,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, discord_role_id: role.id };
  });

/** Bearbeitet eine selbst angelegte Rolle. */
export const updateOrgDiscordRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => roleInput.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertRoleManager(context.userId, data.org_id);
    const { data: row } = await supabaseAdmin
      .from("discord_managed_roles")
      .select("discord_role_id")
      .eq("id", data.id)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (!row) throw new Error("Rolle gehört nicht zu deiner Orga.");

    const { updateGuildRole } = await import("@/lib/discord.server");
    await updateGuildRole(row.discord_role_id as string, {
      name: data.name,
      color: data.color,
      hoist: data.hoist,
      mentionable: data.mentionable,
    });

    const { error } = await supabaseAdmin
      .from("discord_managed_roles")
      .update({
        name: data.name,
        color: data.color,
        hoist: data.hoist,
        mentionable: data.mentionable,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Löscht eine selbst angelegte Rolle im Discord und in der App. */
export const deleteOrgDiscordRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ org_id: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertRoleManager(context.userId, data.org_id);
    const { data: row } = await supabaseAdmin
      .from("discord_managed_roles")
      .select("discord_role_id")
      .eq("id", data.id)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (!row) throw new Error("Rolle gehört nicht zu deiner Orga.");

    const { deleteGuildRole } = await import("@/lib/discord.server");
    await deleteGuildRole(row.discord_role_id as string);
    await supabaseAdmin.from("discord_managed_roles").delete().eq("id", data.id);
    return { ok: true };
  });

/** Vergibt oder entzieht eine erlaubte Rolle an ein Orga-Mitglied. */
export const setOrgMemberDiscordRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        user_id: z.string().uuid(),
        discord_role_id: z.string().min(1).max(40),
        add: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertRoleManager(context.userId, data.org_id);

    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!member) throw new Error("Dieses Mitglied gehört nicht zu deiner Orga.");

    const [{ data: own }, { data: mapped }] = await Promise.all([
      supabaseAdmin
        .from("discord_managed_roles")
        .select("id")
        .eq("org_id", data.org_id)
        .eq("discord_role_id", data.discord_role_id)
        .maybeSingle(),
      supabaseAdmin
        .from("discord_role_mappings")
        .select("id")
        .eq("org_id", data.org_id)
        .eq("discord_role_id", data.discord_role_id)
        .eq("enabled", true)
        .maybeSingle(),
    ]);
    if (!own && !mapped) {
      throw new Error("Diese Rolle ist für deine Orga nicht freigegeben.");
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("discord_user_id")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!profile?.discord_user_id) {
      throw new Error("Dieses Mitglied hat kein verknüpftes Discord-Konto.");
    }

    const { setMemberRole } = await import("@/lib/discord.server");
    await setMemberRole(profile.discord_user_id as string, data.discord_role_id, data.add);
    return { ok: true };
  });
