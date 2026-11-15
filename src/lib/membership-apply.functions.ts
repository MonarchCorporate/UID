import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAppAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Nur App-Admins dürfen die Bewerbungen verwalten.");
  return supabaseAdmin;
}

/** Form config + Discord state + the user's own application. */
export const getApplicationForm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await import("@/lib/membership-apply.server");
    const [settings, fields, info] = await Promise.all([
      m.loadSettings(),
      m.loadFields(true),
      m.applicantInfo(context.userId),
    ]);
    const discord = await m.isOnDiscord(info.discordUserId);
    const { data: mine } = await supabaseAdmin
      .from("membership_applications")
      .select("id, status, answers, review_note, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      settings,
      fields,
      applicant: info,
      discordLinked: !!info.discordUserId,
      discordOnServer: discord.onServer,
      discordError: discord.error,
      application: mine ?? null,
    };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ answers: z.record(z.string(), z.unknown()) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await import("@/lib/membership-apply.server");

    const [settings, fields, info] = await Promise.all([
      m.loadSettings(),
      m.loadFields(true),
      m.applicantInfo(context.userId),
    ]);
    if (!settings.enabled) throw new Error("Bewerbungen sind derzeit deaktiviert.");

    const discord = await m.isOnDiscord(info.discordUserId);
    if (!discord.onServer) {
      throw new Error("Du musst zuerst unserem Discord-Server beitreten.");
    }

    const { data: existing } = await supabaseAdmin
      .from("membership_applications")
      .select("id, status")
      .eq("user_id", context.userId)
      .in("status", ["open", "accepted"])
      .maybeSingle();
    if (existing) throw new Error("Es liegt bereits eine Bewerbung von dir vor.");

    const answers = m.validateAnswers(fields, data.answers);

    const { data: row, error } = await supabaseAdmin
      .from("membership_applications")
      .insert({
        user_id: context.userId,
        discord_user_id: info.discordUserId,
        answers,
        status: "open",
        channel_id: settings.channel_id,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);

    let postError: string | null = null;
    if (settings.channel_id) {
      try {
        const { postEmbed } = await import("@/lib/discord.server");
        const embed = m.buildApplicationEmbed({
          settings,
          fields,
          answers,
          applicant: info,
          status: "open",
          createdAt: row.created_at as string,
        });
        const msg = await postEmbed(
          settings.channel_id,
          embed,
          settings.ping_role_id ? `<@&${settings.ping_role_id}>` : undefined,
        );
        await supabaseAdmin
          .from("membership_applications")
          .update({ message_id: msg.id })
          .eq("id", row.id);
      } catch (err) {
        postError = err instanceof Error ? err.message : String(err);
      }
    } else {
      postError = "Es ist kein Discord-Channel für Bewerbungen konfiguriert.";
    }

    return { id: row.id as string, successText: settings.success_text, postError };
  });

/* ---------------------------------- admin --------------------------------- */

export const getApplicationAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const m = await import("@/lib/membership-apply.server");

    let channels: { id: string; name: string; parentName: string | null }[] = [];
    let channelError: string | null = null;
    try {
      const { fetchGuildChannels } = await import("@/lib/discord.server");
      channels = (await fetchGuildChannels()).map((c) => ({
        id: c.id,
        name: c.name,
        parentName: c.parentName,
      }));
    } catch (err) {
      channelError = err instanceof Error ? err.message : String(err);
    }

    const [settings, fields, { data: apps }] = await Promise.all([
      m.loadSettings(),
      m.loadFields(false),
      supabaseAdmin
        .from("membership_applications")
        .select(
          "id, user_id, discord_user_id, answers, status, review_note, reviewed_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const ids = [...new Set((apps ?? []).map((a) => a.user_id as string))];
    const { data: profiles } = ids.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, callsign, display_name, rsi_handle")
          .in("id", ids)
      : { data: [] as { id: string; callsign: string | null; display_name: string | null; rsi_handle: string | null }[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

    return {
      settings,
      fields,
      channels,
      channelError,
      applications: (apps ?? []).map((a) => {
        const p = byId.get(a.user_id as string);
        return {
          ...a,
          callsign: (p?.callsign as string | null) ?? (p?.display_name as string | null) ?? null,
          rsi_handle: (p?.rsi_handle as string | null) ?? null,
        };
      }),
    };
  });

export const saveApplicationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        enabled: z.boolean(),
        channel_id: z.string().nullable(),
        channel_name: z.string().nullable(),
        embed_title: z.string().min(1).max(256),
        embed_color: z.number().int().min(0).max(0xffffff),
        ping_role_id: z.string().nullable(),
        intro_text: z.string().max(2000),
        success_text: z.string().max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("membership_application_settings")
      .update(data)
      .eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertApplicationField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        field_key: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9_]+$/, "Nur Kleinbuchstaben, Zahlen und _"),
        label: z.string().min(1).max(120),
        help: z.string().max(300).nullable(),
        placeholder: z.string().max(120).nullable(),
        field_type: z.enum(["text", "textarea", "select", "boolean", "number"]),
        required: z.boolean(),
        options: z.array(z.string().min(1).max(80)).max(30),
        sort_order: z.number().int().min(0).max(999),
        active: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = id
      ? await supabaseAdmin.from("membership_application_fields").update(rest).eq("id", id)
      : await supabaseAdmin.from("membership_application_fields").insert(rest);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApplicationField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("membership_application_fields")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderApplicationFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ order: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int() })) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    for (const o of data.order) {
      await supabaseAdmin
        .from("membership_application_fields")
        .update({ sort_order: o.sort_order })
        .eq("id", o.id);
    }
    return { ok: true };
  });

export const setApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "accepted", "rejected"]),
        review_note: z.string().max(1000).nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const m = await import("@/lib/membership-apply.server");

    const { data: row, error } = await supabaseAdmin
      .from("membership_applications")
      .update({
        status: data.status,
        review_note: data.review_note,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, user_id, answers, channel_id, message_id, created_at")
      .single();
    if (error) throw new Error(error.message);

    let postError: string | null = null;
    if (row.channel_id && row.message_id) {
      try {
        const [settings, fields, info] = await Promise.all([
          m.loadSettings(),
          m.loadFields(false),
          m.applicantInfo(row.user_id as string),
        ]);
        const { editEmbed } = await import("@/lib/discord.server");
        await editEmbed(
          row.channel_id as string,
          row.message_id as string,
          m.buildApplicationEmbed({
            settings,
            fields,
            answers: (row.answers ?? {}) as Record<string, string>,
            applicant: info,
            status: data.status,
            createdAt: row.created_at as string,
          }),
        );
      } catch (err) {
        postError = err instanceof Error ? err.message : String(err);
      }
    }
    return { ok: true, postError };
  });
