import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAppAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Nur App-Admins dürfen die Discord-Anbindung verwalten.");
  return supabaseAdmin;
}

export type DiscordAdminState = {
  configured: boolean;
  error: string | null;
  roles: { id: string; name: string; color: number }[];
  orgs: { id: string; name: string; tag: string | null }[];
  mappings: {
    id: string;
    discord_role_id: string;
    discord_role_name: string;
    discord_role_color: number;
    org_id: string;
    enabled: boolean;
    is_lead: boolean;
  }[];
  settings: { remove_on_role_loss: boolean; last_full_sync_at: string | null };
  linkedUsers: number;
};

/** Everything the Discord admin page needs in one round trip. */
export const getDiscordAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscordAdminState> => {
    const supabaseAdmin = await assertAppAdmin(context.userId);

    let roles: DiscordAdminState["roles"] = [];
    let error: string | null = null;
    let configured = true;
    try {
      const { fetchGuildRoles } = await import("@/lib/discord.server");
      roles = (await fetchGuildRoles()).map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
      }));
    } catch (err) {
      configured = false;
      error = err instanceof Error ? err.message : String(err);
    }

    const [{ data: orgs }, { data: mappings }, { data: settings }, { count }] =
      await Promise.all([
        supabaseAdmin.from("orgs").select("id, name, tag").order("name"),
        supabaseAdmin
          .from("discord_role_mappings")
          .select(
            "id, discord_role_id, discord_role_name, discord_role_color, org_id, enabled, is_lead",
          )
          .order("discord_role_name"),
        supabaseAdmin
          .from("discord_settings")
          .select("remove_on_role_loss, last_full_sync_at")
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .not("discord_user_id", "is", null),
      ]);

    return {
      configured,
      error,
      roles,
      orgs: orgs ?? [],
      mappings: mappings ?? [],
      settings: {
        remove_on_role_loss: settings?.remove_on_role_loss ?? false,
        last_full_sync_at: settings?.last_full_sync_at ?? null,
      },
      linkedUsers: count ?? 0,
    };
  });

/** Creates or updates one Discord-role -> org mapping. */
export const upsertDiscordMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        discord_role_id: z.string().min(1),
        discord_role_name: z.string().min(1),
        discord_role_color: z.number().int().default(0),
        org_id: z.string().uuid(),
        enabled: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("discord_role_mappings")
      .upsert(data, { onConflict: "discord_role_id,org_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDiscordMappingEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("discord_role_mappings")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Markiert genau eine Rolle je Orga als Leitungsrolle. Die Leitungsrolle
 * bekommt in allen freigegebenen Kategorien und vom Bot erstellten Kanälen
 * volle Verwaltungsrechte.
 */
export const setDiscordMappingLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), is_lead: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("discord_role_mappings")
      .select("id, org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Zuordnung nicht gefunden.");

    if (data.is_lead) {
      await supabaseAdmin
        .from("discord_role_mappings")
        .update({ is_lead: false })
        .eq("org_id", row.org_id);
    }
    const { error } = await supabaseAdmin
      .from("discord_role_mappings")
      .update({ is_lead: data.is_lead })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const warning = await syncLeadPermissions(supabaseAdmin, row.org_id);
    return { ok: true, warning };
  });

/** Discord role ids marked as leadership role for the org. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function leadRoleIds(supabaseAdmin: any, orgId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("discord_role_mappings")
    .select("discord_role_id")
    .eq("org_id", orgId)
    .eq("enabled", true)
    .eq("is_lead", true);
  return ((data ?? []) as { discord_role_id: string }[]).map((r) => r.discord_role_id);
}

/**
 * Schreibt die Vollrechte der Leitungsrolle in alle freigegebenen Kategorien
 * und in alle vom Bot erstellten Kanäle der Orga.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncLeadPermissions(supabaseAdmin: any, orgId: string): Promise<string | null> {
  const leads = await leadRoleIds(supabaseAdmin, orgId);
  const [{ data: cats }, { data: managed }] = await Promise.all([
    supabaseAdmin.from("discord_org_categories").select("category_id").eq("org_id", orgId),
    supabaseAdmin.from("discord_managed_channels").select("channel_id").eq("org_id", orgId),
  ]);
  const targets = [
    ...((cats ?? []) as { category_id: string }[]).map((c) => c.category_id),
    ...((managed ?? []) as { channel_id: string }[]).map((m) => m.channel_id),
  ];
  if (!targets.length) return null;
  const { applyLeadPermissions } = await import("@/lib/discord.server");
  let warning: string | null = null;
  for (const id of targets) {
    try {
      await applyLeadPermissions(id, leads);
    } catch (err) {
      warning = err instanceof Error ? err.message : String(err);
    }
  }
  return warning;
}

export const deleteDiscordMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("discord_role_mappings")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDiscordSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ remove_on_role_loss: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("discord_settings")
      .upsert({ id: true, remove_on_role_loss: data.remove_on_role_loss });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Re-applies all mappings for every linked account. */
export const runDiscordFullSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { syncMembershipsForUser } = await import("@/lib/discord.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, discord_user_id")
      .not("discord_user_id", "is", null);

    let added = 0;
    let removed = 0;
    let missing = 0;
    for (const p of profiles ?? []) {
      try {
        const res = await syncMembershipsForUser(p.id, p.discord_user_id as string);
        added += res.added.length;
        removed += res.removed.length;
        if (!res.onServer) missing += 1;
      } catch (err) {
        console.error("[discord] sync failed for", p.id, err);
      }
    }
    await supabaseAdmin
      .from("discord_settings")
      .upsert({ id: true, last_full_sync_at: new Date().toISOString() });

    return { users: profiles?.length ?? 0, added, removed, missing };
  });

/** Sync for the signed-in user (self-service button in the profile/dashboard). */
export const getDiscordBotInvite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context.userId);
    const { botInviteUrl, fetchBotStatus } = await import("@/lib/discord.server");
    let inviteUrl: string | null = null;
    let inviteUrlAnyServer: string | null = null;
    let error: string | null = null;
    let status = null as Awaited<ReturnType<typeof fetchBotStatus>> | null;
    try {
      inviteUrlAnyServer = botInviteUrl();
      inviteUrl = botInviteUrl(process.env.DISCORD_GUILD_ID);
      status = await fetchBotStatus();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return { inviteUrl, inviteUrlAnyServer, status, error };
  });

/** Current bot name, avatar and server nickname. */
export const getDiscordBotProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context.userId);
    const { fetchBotProfile } = await import("@/lib/discord.server");
    try {
      return { profile: await fetchBotProfile(), error: null as string | null };
    } catch (err) {
      return {
        profile: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

/** Renames the bot, sets a new avatar and/or its nickname on the server. */
export const saveDiscordBotProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        username: z.string().trim().min(2).max(32).optional(),
        nickname: z.string().trim().max(32).nullable().optional(),
        avatarDataUri: z
          .string()
          .regex(/^data:image\/(png|jpeg|jpg|gif);base64,/, "Nur PNG, JPG oder GIF.")
          .max(2_800_000, "Bild ist zu groß (max. ~2 MB).")
          .nullable()
          .optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context.userId);
    const { updateBotProfile } = await import("@/lib/discord.server");
    return { profile: await updateBotProfile(data) };
  });

export const syncMyDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("discord_user_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me?.discord_user_id) throw new Error("Kein Discord-Konto verknüpft.");
    const { syncMembershipsForUser } = await import("@/lib/discord.server");
    return syncMembershipsForUser(context.userId, me.discord_user_id);
  });

/* ------------------------------------------------------------------ */
/* Channel-Freigaben pro Orga (App-Admin)                              */
/* ------------------------------------------------------------------ */

/** All guild channels plus the current per-org assignment. */
export const getDiscordChannelState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    let channels: { id: string; name: string; parentName: string | null }[] = [];
    let error: string | null = null;
    try {
      const { fetchGuildChannels } = await import("@/lib/discord.server");
      channels = (await fetchGuildChannels()).map((c) => ({
        id: c.id,
        name: c.name,
        parentName: c.parentName,
      }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const [{ data: orgs }, { data: assignments }] = await Promise.all([
      supabaseAdmin.from("orgs").select("id, name, tag").order("name"),
      supabaseAdmin
        .from("discord_org_channels")
        .select(
          "id, org_id, channel_id, channel_name, allow_mentions, allow_here, allow_role_mentions",
        ),
    ]);
    return {
      channels,
      error,
      orgs: orgs ?? [],
      assignments: assignments ?? [],
    };
  });

/** Replaces the channel list of one org. */
export const setOrgDiscordChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        channels: z
          .array(
            z.object({
              channel_id: z.string().min(1),
              channel_name: z.string().min(1),
              allow_mentions: z.boolean().default(false),
              allow_here: z.boolean().default(false),
              allow_role_mentions: z.boolean().default(false),
            }),
          )
          .max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    await supabaseAdmin
      .from("discord_org_channels")
      .delete()
      .eq("org_id", data.org_id);
    if (data.channels.length) {
      const { error } = await supabaseAdmin
        .from("discord_org_channels")
        .insert(data.channels.map((c) => ({ ...c, org_id: data.org_id })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Posten aus der Orgaverwaltung                                       */
/* ------------------------------------------------------------------ */

async function assertOrgPoster(userId: string, orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { userHasOrgPerm } = await import("@/lib/org-perms.server");
  const ok = await userHasOrgPerm(supabaseAdmin, userId, orgId, "discord.post");
  if (!ok) throw new Error("Keine Berechtigung, für diese Orga zu posten.");
  return supabaseAdmin;
}

async function assertChannelAllowed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  orgId: string,
  channelId: string,
) {
  const { data: ch } = await supabaseAdmin
    .from("discord_org_channels")
    .select("channel_id, channel_name, allow_mentions, allow_here, allow_role_mentions")
    .eq("org_id", orgId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!ch) throw new Error("Dieser Channel ist für deine Orga nicht freigegeben.");
  return ch as {
    channel_id: string;
    channel_name: string;
    allow_mentions: boolean;
    allow_here: boolean;
    allow_role_mentions: boolean;
  };
}

const mentionSchema = z.object({
  mention: z.enum(["none", "everyone", "here", "role"]).default("none"),
  mention_role_id: z.string().min(1).max(40).nullable().optional(),
});

/**
 * Validates the requested ping against the channel's release flags and
 * returns the plain-text content Discord should render above the embed.
 */
async function buildMention(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  orgId: string,
  ch: {
    allow_mentions: boolean;
    allow_here: boolean;
    allow_role_mentions: boolean;
  },
  mention: "none" | "everyone" | "here" | "role",
  roleId?: string | null,
): Promise<string | undefined> {
  if (mention === "none") return undefined;
  if (mention === "everyone") {
    if (!ch.allow_mentions) throw new Error("@everyone ist in diesem Channel nicht erlaubt.");
    return "@everyone";
  }
  if (mention === "here") {
    if (!ch.allow_here) throw new Error("@here ist in diesem Channel nicht erlaubt.");
    return "@here";
  }
  if (!ch.allow_role_mentions)
    throw new Error("Rollen-Erwähnungen sind in diesem Channel nicht erlaubt.");
  if (!roleId) throw new Error("Bitte eine Rolle auswählen.");
  const { data: role } = await supabaseAdmin
    .from("discord_role_mappings")
    .select("discord_role_id")
    .eq("org_id", orgId)
    .eq("discord_role_id", roleId)
    .eq("enabled", true)
    .maybeSingle();
  if (!role) throw new Error("Diese Rolle gehört nicht zu deiner Orga.");
  return `<@&${role.discord_role_id}>`;
}

/** Channels the org may post in + recent posts + announceable missions. */
export const getOrgDiscordState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ org_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const { syncOrgDiscordChannels } = await import("@/lib/discord-channel-sync.server");
    await syncOrgDiscordChannels(supabaseAdmin, data.org_id);
    const [{ data: channels }, { data: posts }, { data: missions }, { data: roles }] =
      await Promise.all([
      supabaseAdmin
        .from("discord_org_channels")
        .select("channel_id, channel_name, allow_mentions, allow_here, allow_role_mentions")
        .eq("org_id", data.org_id)
        .order("channel_name"),
      supabaseAdmin
        .from("discord_posts")
        .select("id, channel_id, channel_name, message_id, kind, title, created_at, posted_by")
        .eq("org_id", data.org_id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("missions")
        .select("id, slug, title, starts_at, description, status")
        .eq("org_id", data.org_id)
        .order("starts_at", { ascending: true })
        .limit(50),
      supabaseAdmin
        .from("discord_role_mappings")
        .select("discord_role_id, discord_role_name")
        .eq("org_id", data.org_id)
        .eq("enabled", true)
        .order("discord_role_name"),
    ]);
    return {
      channels: channels ?? [],
      posts: posts ?? [],
      missions: missions ?? [],
      roles: roles ?? [],
    };
  });

const HEX = /^#?[0-9a-fA-F]{6}$/;

function colorToInt(hex?: string | null): number | undefined {
  if (!hex || !HEX.test(hex)) return undefined;
  return parseInt(hex.replace("#", ""), 16);
}

/** Free-form embed message. */
export const postOrgDiscordMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        channel_id: z.string().min(1),
        title: z.string().trim().min(1).max(256),
        body: z.string().trim().min(1).max(4000),
        image_url: z.string().url().max(1000).nullable().optional(),
        color: z.string().max(7).nullable().optional(),
      })
      .merge(mentionSchema)
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const ch = await assertChannelAllowed(supabaseAdmin, data.org_id, data.channel_id);
    const content = await buildMention(
      supabaseAdmin,
      data.org_id,
      ch,
      data.mention,
      data.mention_role_id,
    );
    const { postEmbed } = await import("@/lib/discord.server");
    const msg = await postEmbed(
      data.channel_id,
      {
        title: data.title,
        description: data.body,
        color: colorToInt(data.color),
        ...(data.image_url ? { image: { url: data.image_url } } : {}),
        timestamp: new Date().toISOString(),
      },
      content,
    );
    await supabaseAdmin.from("discord_posts").insert({
      org_id: data.org_id,
      channel_id: data.channel_id,
      channel_name: ch.channel_name,
      message_id: msg.id,
      kind: "message",
      title: data.title,
      posted_by: context.userId,
    });
    return { ok: true, message_id: msg.id };
  });

/** Event announcement built from an existing mission. */
export const postOrgMissionAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        channel_id: z.string().min(1),
        mission_id: z.string().uuid(),
        note: z.string().trim().max(1000).nullable().optional(),
        password: z.string().trim().max(100).nullable().optional(),
      })
      .merge(mentionSchema)
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const ch = await assertChannelAllowed(supabaseAdmin, data.org_id, data.channel_id);
    const content = await buildMention(
      supabaseAdmin,
      data.org_id,
      ch,
      data.mention,
      data.mention_role_id,
    );

    const { data: mission } = await supabaseAdmin
      .from("missions")
      .select(
        "id, slug, title, description, starts_at, show_participant_count, category_id, org_id",
      )
      .eq("id", data.mission_id)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (!mission) throw new Error("Einsatz nicht gefunden.");

    const [{ data: category }, { data: org }, { count }] = await Promise.all([
      mission.category_id
        ? supabaseAdmin
            .from("mission_categories")
            .select("name, color")
            .eq("id", mission.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from("orgs")
        .select("name, slug, branding")
        .eq("id", data.org_id)
        .maybeSingle(),
      supabaseAdmin
        .from("mission_participants")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", mission.id),
    ]);

    const base = (process.env.PUBLIC_SITE_URL ?? "https://uid.sc").replace(/\/$/, "");
    const url = `${base}/ops/${mission.slug}`;
    const ts = mission.starts_at
      ? Math.floor(new Date(mission.starts_at).getTime() / 1000)
      : null;

    const fields: { name: string; value: string; inline?: boolean }[] = [];
    if (ts) fields.push({ name: "Start", value: `<t:${ts}:F> (<t:${ts}:R>)` });
    if (category?.name)
      fields.push({ name: "Kategorie", value: category.name, inline: true });
    if (mission.show_participant_count)
      fields.push({ name: "Angemeldet", value: String(count ?? 0), inline: true });
    if (data.password)
      fields.push({ name: "Einsatzpasswort", value: `||${data.password}||`, inline: true });
    fields.push({ name: "Anmeldung", value: url });

    const { postEmbed } = await import("@/lib/discord.server");
    const embed = {
      title: mission.title,
      url,
      description:
        [data.note, mission.description].filter(Boolean).join("\n\n").slice(0, 4000) ||
        undefined,
      color:
        colorToInt(category?.color) ??
        colorToInt(
          (org?.branding as { accent?: string; accent_color?: string } | null)?.accent ??
            (org?.branding as { accent_color?: string } | null)?.accent_color ??
            null,
        ) ??
        0x22d3ee,
      fields,
      footer: { text: org?.name ?? "United Imperial Dominion" },
      ...(mission.starts_at ? { timestamp: mission.starts_at } : {}),
    };
    const msg = await postEmbed(data.channel_id, embed, content);

    await supabaseAdmin.from("discord_posts").insert({
      org_id: data.org_id,
      channel_id: data.channel_id,
      channel_name: ch.channel_name,
      message_id: msg.id,
      mission_id: mission.id,
      kind: "event",
      embed,
      title: mission.title,
      posted_by: context.userId,
    });
    return { ok: true, message_id: msg.id };
  });

/** Removes a previously posted message from Discord and the log. */
export const deleteOrgDiscordPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ org_id: z.string().uuid(), id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const { data: post } = await supabaseAdmin
      .from("discord_posts")
      .select("id, channel_id, message_id")
      .eq("id", data.id)
      .eq("org_id", data.org_id)
      .maybeSingle();
    if (!post) throw new Error("Beitrag nicht gefunden.");
    if (post.message_id) {
      const { deleteMessage } = await import("@/lib/discord.server");
      await deleteMessage(post.channel_id, post.message_id);
    }
    await supabaseAdmin.from("discord_posts").delete().eq("id", post.id);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Kategorie-Freigaben & Channelverwaltung                             */
/* ------------------------------------------------------------------ */

/** Admin view: all guild categories + per-org releases. */
export const getDiscordCategoryState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    let categories: { id: string; name: string }[] = [];
    let error: string | null = null;
    try {
      const { fetchGuildCategories } = await import("@/lib/discord.server");
      categories = (await fetchGuildCategories()).map((c) => ({ id: c.id, name: c.name }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const [{ data: orgs }, { data: releases }] = await Promise.all([
      supabaseAdmin.from("orgs").select("id, name, tag").order("name"),
      supabaseAdmin
        .from("discord_org_categories")
        .select("id, org_id, category_id, category_name, can_create, can_rename, can_delete, max_channels"),
    ]);
    return { categories, error, orgs: orgs ?? [], releases: releases ?? [] };
  });

/** Replaces the category releases of one org. */
export const setOrgDiscordCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        categories: z
          .array(
            z.object({
              category_id: z.string().min(1),
              category_name: z.string().min(1),
              can_create: z.boolean().default(true),
              can_rename: z.boolean().default(true),
              can_delete: z.boolean().default(false),
              max_channels: z.number().int().min(0).max(200).default(10),
            }),
          )
          .max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    await supabaseAdmin.from("discord_org_categories").delete().eq("org_id", data.org_id);
    if (data.categories.length) {
      const { error } = await supabaseAdmin
        .from("discord_org_categories")
        .insert(data.categories.map((c) => ({ ...c, org_id: data.org_id })));
      if (error) throw new Error(error.message);
    }
    const warning = await syncLeadPermissions(supabaseAdmin, data.org_id);
    return { ok: true, warning };
  });

const CHANNEL_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,88}$/u;

function normalizeChannelName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!CHANNEL_NAME.test(name)) {
    throw new Error(
      "Ungültiger Channelname. Erlaubt sind 2–90 Zeichen aus Buchstaben, Zahlen, Leerzeichen, - und _.",
    );
  }
  return name;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertCategoryAllowed(supabaseAdmin: any, orgId: string, categoryId: string) {
  const { data: cat } = await supabaseAdmin
    .from("discord_org_categories")
    .select("category_id, category_name, can_create, can_rename, can_delete, max_channels")
    .eq("org_id", orgId)
    .eq("category_id", categoryId)
    .maybeSingle();
  if (!cat) throw new Error("Diese Kategorie ist für deine Orga nicht freigegeben.");
  return cat as {
    category_id: string;
    category_name: string;
    can_create: boolean;
    can_rename: boolean;
    can_delete: boolean;
    max_channels: number;
  };
}

export type OrgChannelAdminState = {
  error: string | null;
  categories: {
    category_id: string;
    category_name: string;
    can_create: boolean;
    can_rename: boolean;
    can_delete: boolean;
    max_channels: number;
    used: number;
    channels: {
      id: string;
      name: string;
      kind: "text" | "voice";
      managed: boolean;
      visibility: "public" | "private";
      visible_role_ids: string[];
    }[];
  }[];
  orgRoles: { id: string; name: string }[];
};

/** Discord role IDs that are mapped to the org (the roles that unlock it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function orgRoleIds(supabaseAdmin: any, orgId: string) {
  const { data } = await supabaseAdmin
    .from("discord_role_mappings")
    .select("discord_role_id, discord_role_name")
    .eq("org_id", orgId)
    .eq("enabled", true);
  return ((data ?? []) as { discord_role_id: string; discord_role_name: string }[]).map((r) => ({
    id: r.discord_role_id,
    name: r.discord_role_name,
  }));
}

/** Everything the org-side channel management tab needs. */
export const getOrgDiscordChannelAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ org_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<OrgChannelAdminState> => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const [{ data: releases }, { data: managed }] = await Promise.all([
      supabaseAdmin
        .from("discord_org_categories")
        .select("category_id, category_name, can_create, can_rename, can_delete, max_channels")
        .eq("org_id", data.org_id)
        .order("category_name"),
      supabaseAdmin
        .from("discord_managed_channels")
        .select("channel_id, category_id, visibility, visible_role_ids")
        .eq("org_id", data.org_id),
    ]);

    const managedIds = new Set((managed ?? []).map((m) => m.channel_id));
    const visById = new Map(
      (managed ?? []).map((m) => [m.channel_id, (m.visibility ?? "public") as "public" | "private"]),
    );
    const rolesById = new Map(
      (managed ?? []).map((m) => [m.channel_id, (m.visible_role_ids ?? []) as string[]]),
    );
    const orgRoles = await orgRoleIds(supabaseAdmin, data.org_id);
    let error: string | null = null;
    const categories: OrgChannelAdminState["categories"] = [];

    for (const rel of releases ?? []) {
      let channels: OrgChannelAdminState["categories"][number]["channels"] = [];
      try {
        const { fetchCategoryChannels } = await import("@/lib/discord.server");
        channels = (await fetchCategoryChannels(rel.category_id)).map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.type === 2 ? ("voice" as const) : ("text" as const),
          managed: managedIds.has(c.id),
          visibility: visById.get(c.id) ?? ("public" as const),
          visible_role_ids: rolesById.get(c.id) ?? [],
        }));
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      categories.push({
        ...rel,
        used: (managed ?? []).filter((m) => m.category_id === rel.category_id).length,
        channels,
      });
    }
    return { error, categories, orgRoles };
  });

/** Creates a channel inside a released category. */
export const createOrgDiscordChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        category_id: z.string().min(1),
        name: z.string().min(2).max(90),
        kind: z.enum(["text", "voice"]).default("text"),
        visibility: z.enum(["public", "private"]).default("public"),
        role_ids: z.array(z.string().min(1)).max(50).optional(),
        topic: z.string().trim().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const cat = await assertCategoryAllowed(supabaseAdmin, data.org_id, data.category_id);
    if (!cat.can_create) throw new Error("Für diese Kategorie ist das Anlegen nicht freigegeben.");

    const { count } = await supabaseAdmin
      .from("discord_managed_channels")
      .select("id", { count: "exact", head: true })
      .eq("org_id", data.org_id)
      .eq("category_id", data.category_id);
    if ((count ?? 0) >= cat.max_channels) {
      throw new Error(`Limit erreicht: maximal ${cat.max_channels} Channels in dieser Kategorie.`);
    }

    const name = normalizeChannelName(data.name);
    const { createGuildChannel, applyChannelVisibility } = await import("@/lib/discord.server");
    const leads = await leadRoleIds(supabaseAdmin, data.org_id);
    const created = await createGuildChannel({
      name,
      parentId: data.category_id,
      kind: data.kind,
      topic: data.topic ?? null,
      leadRoleIds: leads,
    });

    const roles = await orgRoleIds(supabaseAdmin, data.org_id);
    const allowedIds = roles.map((r) => r.id);
    const picked = (data.role_ids ?? []).filter((id) => allowedIds.includes(id));
    const effectiveRoleIds = picked.length > 0 ? picked : allowedIds;
    if (data.visibility === "private") {
      await applyChannelVisibility(created.id, "private", effectiveRoleIds, leads);
    }

    await supabaseAdmin.from("discord_managed_channels").insert({
      org_id: data.org_id,
      category_id: data.category_id,
      channel_id: created.id,
      channel_name: created.name,
      kind: data.kind,
      visibility: data.visibility,
      visible_role_ids: data.visibility === "private" ? picked : [],
      created_by: context.userId,
    });

    if (data.kind === "text") {
      await supabaseAdmin.from("discord_org_channels").upsert(
        {
          org_id: data.org_id,
          channel_id: created.id,
          channel_name: created.name,
          allow_mentions: false,
          allow_here: false,
          allow_role_mentions: false,
        },
        { onConflict: "org_id,channel_id" },
      );
    }

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "discord.channel.create",
      entityType: "discord_channel",
      entityId: created.id,
      summary: `Channel #${created.name} in ${cat.category_name} angelegt (${
        data.visibility === "private" ? "privat" : "öffentlich"
      })`,
    });

    return { ok: true, channel_id: created.id };
  });

/** Switches a managed channel between public and org-only visibility. */
export const setOrgDiscordChannelVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        channel_id: z.string().min(1),
        visibility: z.enum(["public", "private"]),
        role_ids: z.array(z.string().min(1)).max(50).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const { data: row } = await supabaseAdmin
      .from("discord_managed_channels")
      .select("channel_id, category_id, channel_name")
      .eq("org_id", data.org_id)
      .eq("channel_id", data.channel_id)
      .maybeSingle();
    if (!row) throw new Error("Dieser Channel wurde nicht über die App erstellt.");
    await assertCategoryAllowed(supabaseAdmin, data.org_id, row.category_id);

    const roles = await orgRoleIds(supabaseAdmin, data.org_id);
    if (data.visibility === "private" && roles.length === 0) {
      throw new Error(
        "Deiner Orga ist keine Discord-Rolle zugeordnet — ein privater Channel wäre für niemanden sichtbar.",
      );
    }
    const allowedIds = roles.map((r) => r.id);
    const picked = (data.role_ids ?? []).filter((id) => allowedIds.includes(id));
    const effectiveRoleIds = picked.length > 0 ? picked : allowedIds;

    const { applyChannelVisibility } = await import("@/lib/discord.server");
    await applyChannelVisibility(
      row.channel_id,
      data.visibility,
      effectiveRoleIds,
      await leadRoleIds(supabaseAdmin, data.org_id),
    );

    await supabaseAdmin
      .from("discord_managed_channels")
      .update({
        visibility: data.visibility,
        visible_role_ids: data.visibility === "private" ? picked : [],
      })
      .eq("channel_id", row.channel_id);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "discord.channel.visibility",
      entityType: "discord_channel",
      entityId: row.channel_id,
      summary: `Channel #${row.channel_name} auf ${
        data.visibility === "private"
          ? `privat (${
              picked.length > 0
                ? roles
                    .filter((r) => picked.includes(r.id))
                    .map((r) => `@${r.name}`)
                    .join(", ")
                : "alle Orga-Rollen"
            })`
          : "öffentlich"
      } gesetzt`,
    });
    return { ok: true };
  });

/** Renames a channel the app created. */
export const renameOrgDiscordChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        channel_id: z.string().min(1),
        name: z.string().min(2).max(90),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const { data: row } = await supabaseAdmin
      .from("discord_managed_channels")
      .select("channel_id, category_id, kind")
      .eq("org_id", data.org_id)
      .eq("channel_id", data.channel_id)
      .maybeSingle();
    if (!row) throw new Error("Dieser Channel wurde nicht über die App erstellt.");
    const cat = await assertCategoryAllowed(supabaseAdmin, data.org_id, row.category_id);
    if (!cat.can_rename) throw new Error("Umbenennen ist für diese Kategorie nicht freigegeben.");

    const name = normalizeChannelName(data.name);
    const { renameGuildChannel } = await import("@/lib/discord.server");
    await renameGuildChannel(row.channel_id, name);

    await supabaseAdmin
      .from("discord_managed_channels")
      .update({ channel_name: name })
      .eq("channel_id", row.channel_id);
    await supabaseAdmin
      .from("discord_org_channels")
      .update({ channel_name: name })
      .eq("org_id", data.org_id)
      .eq("channel_id", row.channel_id);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "discord.channel.rename",
      entityType: "discord_channel",
      entityId: row.channel_id,
      summary: `Channel umbenannt in #${name}`,
    });
    return { ok: true };
  });

/** Deletes a channel the app created. */
export const deleteOrgDiscordChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ org_id: z.string().uuid(), channel_id: z.string().min(1) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertOrgPoster(context.userId, data.org_id);
    const { data: row } = await supabaseAdmin
      .from("discord_managed_channels")
      .select("channel_id, category_id, channel_name")
      .eq("org_id", data.org_id)
      .eq("channel_id", data.channel_id)
      .maybeSingle();
    if (!row) throw new Error("Dieser Channel wurde nicht über die App erstellt.");
    const cat = await assertCategoryAllowed(supabaseAdmin, data.org_id, row.category_id);
    if (!cat.can_delete) throw new Error("Löschen ist für diese Kategorie nicht freigegeben.");

    const { deleteGuildChannel } = await import("@/lib/discord.server");
    await deleteGuildChannel(row.channel_id);

    await supabaseAdmin
      .from("discord_managed_channels")
      .delete()
      .eq("channel_id", row.channel_id);
    await supabaseAdmin
      .from("discord_org_channels")
      .delete()
      .eq("org_id", data.org_id)
      .eq("channel_id", row.channel_id);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "discord.channel.delete",
      entityType: "discord_channel",
      entityId: row.channel_id,
      summary: `Channel #${row.channel_name} gelöscht`,
    });
    return { ok: true };
  });

/** App-Admin: löscht eine komplette Discord-Kategorie samt aller Channels darin. */
export const deleteDiscordCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ category_id: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { fetchGuildCategories, fetchCategoryChannels, deleteGuildChannel } = await import(
      "@/lib/discord.server"
    );

    const categories = await fetchGuildCategories();
    const category = categories.find((c) => c.id === data.category_id);
    if (!category) throw new Error("Kategorie nicht gefunden.");

    const children = await fetchCategoryChannels(data.category_id);
    for (const ch of children) {
      await deleteGuildChannel(ch.id);
      await supabaseAdmin.from("discord_managed_channels").delete().eq("channel_id", ch.id);
      await supabaseAdmin.from("discord_org_channels").delete().eq("channel_id", ch.id);
    }
    await deleteGuildChannel(data.category_id);
    await supabaseAdmin
      .from("discord_org_categories")
      .delete()
      .eq("category_id", data.category_id);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      action: "discord.category.delete",
      entityType: "discord_category",
      entityId: data.category_id,
      summary: `Kategorie ${category.name} inkl. ${children.length} Channel gelöscht`,
    });
    return { ok: true, deleted: children.length, name: category.name };
  });

/* ------------------------------------------------------------------ */
/* App-Admin: Bot-Nachrichten in beliebige Guild-Channel               */
/* ------------------------------------------------------------------ */

/** All guild channels, roles and the admin post log in one round trip. */
export const getAdminDiscordPostState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    let channels: { id: string; name: string; parentName: string | null }[] = [];
    let roles: { id: string; name: string; color: number }[] = [];
    let error: string | null = null;
    try {
      const { fetchGuildChannels, fetchGuildRoles } = await import("@/lib/discord.server");
      const [ch, rl] = await Promise.all([fetchGuildChannels(), fetchGuildRoles()]);
      channels = ch.map((c) => ({ id: c.id, name: c.name, parentName: c.parentName }));
      roles = rl
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const { data: posts } = await supabaseAdmin
      .from("discord_posts")
      .select("id, channel_id, channel_name, message_id, kind, title, created_at, org_id")
      .is("org_id", null)
      .order("created_at", { ascending: false })
      .limit(25);
    return { channels, roles, error, posts: posts ?? [] };
  });

const adminEmbedSchema = z.object({
  channel_id: z.string().min(1),
  title: z.string().trim().min(1).max(256),
  body: z.string().trim().min(1).max(4000),
  image_url: z.string().url().max(1000).nullable().optional(),
  footer: z.string().trim().max(200).nullable().optional(),
  color: z.string().max(7).nullable().optional(),
  mention: z.enum(["none", "everyone", "here", "role"]).default("none"),
  mention_role_id: z.string().nullable().optional(),
});

/** Posts a free-form embed as the bot into any guild channel. */
export const postAdminDiscordMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => adminEmbedSchema.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { postEmbed, fetchGuildChannels } = await import("@/lib/discord.server");
    const channel = (await fetchGuildChannels()).find((c) => c.id === data.channel_id);
    if (!channel) throw new Error("Channel nicht gefunden.");

    const content =
      data.mention === "everyone"
        ? "@everyone"
        : data.mention === "here"
          ? "@here"
          : data.mention === "role" && data.mention_role_id
            ? `<@&${data.mention_role_id}>`
            : undefined;

    const msg = await postEmbed(
      data.channel_id,
      {
        title: data.title,
        description: data.body,
        color: colorToInt(data.color),
        ...(data.image_url ? { image: { url: data.image_url } } : {}),
        ...(data.footer ? { footer: { text: data.footer } } : {}),
        timestamp: new Date().toISOString(),
      },
      content,
    );

    await supabaseAdmin.from("discord_posts").insert({
      org_id: null,
      channel_id: data.channel_id,
      channel_name: channel.name,
      message_id: msg.id,
      kind: "admin_message",
      title: data.title,
      posted_by: context.userId,
    });
    return { ok: true, message_id: msg.id };
  });

/** Updates an embed previously posted by an admin. */
export const editAdminDiscordMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(256),
        body: z.string().trim().min(1).max(4000),
        image_url: z.string().url().max(1000).nullable().optional(),
        footer: z.string().trim().max(200).nullable().optional(),
        color: z.string().max(7).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { data: post } = await supabaseAdmin
      .from("discord_posts")
      .select("id, channel_id, message_id")
      .eq("id", data.id)
      .is("org_id", null)
      .maybeSingle();
    if (!post?.message_id) throw new Error("Beitrag nicht gefunden.");
    const { editEmbed } = await import("@/lib/discord.server");
    await editEmbed(post.channel_id, post.message_id, {
      title: data.title,
      description: data.body,
      color: colorToInt(data.color),
      ...(data.image_url ? { image: { url: data.image_url } } : {}),
      ...(data.footer ? { footer: { text: data.footer } } : {}),
      timestamp: new Date().toISOString(),
    });
    await supabaseAdmin.from("discord_posts").update({ title: data.title }).eq("id", post.id);
    return { ok: true };
  });

/** Deletes an admin bot message from Discord and the log. */
export const deleteAdminDiscordPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { data: post } = await supabaseAdmin
      .from("discord_posts")
      .select("id, channel_id, message_id")
      .eq("id", data.id)
      .is("org_id", null)
      .maybeSingle();
    if (!post) throw new Error("Beitrag nicht gefunden.");
    if (post.message_id) {
      const { deleteMessage } = await import("@/lib/discord.server");
      await deleteMessage(post.channel_id, post.message_id);
    }
    await supabaseAdmin.from("discord_posts").delete().eq("id", post.id);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* App-Admin: Reaktions-Rollen                                          */
/* ------------------------------------------------------------------ */

const reactionOptionSchema = z.object({
  emoji: z.string().trim().min(1).max(60),
  role_id: z.string().min(1).max(32),
  role_name: z.string().max(120).default(""),
  description: z.string().trim().max(200).nullable().optional(),
});

const reactionPanelSchema = z.object({
  channel_id: z.string().min(1),
  title: z.string().trim().min(1).max(256),
  body: z.string().trim().max(4000).default(""),
  color: z.string().max(7).nullable().optional(),
  options: z.array(reactionOptionSchema).min(1).max(20),
});

function reactionPanelEmbed(input: {
  title: string;
  body: string;
  color?: string | null;
  options: { emoji: string; role_name: string; description?: string | null }[];
}) {
  const list = input.options
    .map(
      (o) =>
        `${o.emoji.includes(":") ? `<:${o.emoji}>` : o.emoji} — **${o.role_name}**` +
        (o.description ? ` · ${o.description}` : ""),
    )
    .join("\n");
  return {
    title: input.title,
    description: `${input.body ? `${input.body}\n\n` : ""}${list}`,
    color: colorToInt(input.color ?? null),
    footer: { text: "Reaktion setzen = Rolle erhalten · Reaktion entfernen = Rolle abgeben" },
  };
}

/** Alle Reaktions-Rollen-Nachrichten samt Channel- und Rollenliste. */
export const getReactionRoleState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    let channels: { id: string; name: string; parentName: string | null }[] = [];
    let roles: { id: string; name: string; color: number }[] = [];
    let error: string | null = null;
    try {
      const { fetchGuildChannels, fetchGuildRoles } = await import("@/lib/discord.server");
      const [ch, rl] = await Promise.all([fetchGuildChannels(), fetchGuildRoles()]);
      channels = ch.map((c) => ({ id: c.id, name: c.name, parentName: c.parentName }));
      roles = rl
        .filter((r) => r.name !== "@everyone" && !r.managed)
        .map((r) => ({ id: r.id, name: r.name, color: r.color }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const { data: panels } = await supabaseAdmin
      .from("discord_reaction_role_panels")
      .select("id, channel_id, channel_name, message_id, title, body, color, options, created_at")
      .order("created_at", { ascending: false });
    return { channels, roles, error, panels: panels ?? [] };
  });

/** Postet eine neue Reaktions-Rollen-Nachricht und setzt alle Emojis. */
export const createReactionRolePanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => reactionPanelSchema.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { postEmbed, addOwnReaction, fetchGuildChannels } = await import(
      "@/lib/discord.server"
    );
    const channel = (await fetchGuildChannels()).find((c) => c.id === data.channel_id);
    if (!channel) throw new Error("Channel nicht gefunden.");

    const msg = await postEmbed(data.channel_id, reactionPanelEmbed(data));
    for (const o of data.options) {
      await addOwnReaction(data.channel_id, msg.id, o.emoji).catch(() => {});
    }
    const { error } = await supabaseAdmin.from("discord_reaction_role_panels").insert({
      channel_id: data.channel_id,
      channel_name: channel.name,
      message_id: msg.id,
      title: data.title,
      body: data.body,
      color: colorToInt(data.color ?? null),
      options: data.options as never,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, message_id: msg.id };
  });

/** Aktualisiert Text und Rollenzuordnung einer bestehenden Nachricht. */
export const updateReactionRolePanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => reactionPanelSchema.extend({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { data: panel } = await supabaseAdmin
      .from("discord_reaction_role_panels")
      .select("id, channel_id, message_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!panel?.message_id) throw new Error("Nachricht nicht gefunden.");
    const { editEmbed, addOwnReaction } = await import("@/lib/discord.server");
    await editEmbed(panel.channel_id, panel.message_id, reactionPanelEmbed(data));
    for (const o of data.options) {
      await addOwnReaction(panel.channel_id, panel.message_id, o.emoji).catch(() => {});
    }
    await supabaseAdmin
      .from("discord_reaction_role_panels")
      .update({
        title: data.title,
        body: data.body,
        color: colorToInt(data.color ?? null),
        options: data.options as never,
      })
      .eq("id", panel.id);
    return { ok: true };
  });

/** Löscht die Nachricht in Discord und den Eintrag im Backoffice. */
export const deleteReactionRolePanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { data: panel } = await supabaseAdmin
      .from("discord_reaction_role_panels")
      .select("id, channel_id, message_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!panel) throw new Error("Nachricht nicht gefunden.");
    if (panel.message_id) {
      const { deleteMessage } = await import("@/lib/discord.server");
      await deleteMessage(panel.channel_id, panel.message_id).catch(() => {});
    }
    await supabaseAdmin.from("discord_reaction_role_panels").delete().eq("id", panel.id);
    return { ok: true };
  });
