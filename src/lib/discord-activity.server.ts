/**
 * Server-side ingest + reconciliation for the external Discord gateway bot.
 * The bot (hosted on Railway) pushes events here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

/** Spam-Schutz für Nachrichten-Tracking. */
const MESSAGE_MIN_CHARS = 10;
const MESSAGE_COOLDOWN_SECONDS = 10;

export type ActiveVoiceEntry = {
  discord_user_id: string;
  discord_username?: string | null;
  channel_id: string;
  channel_name?: string | null;
};

async function resolveUserId(admin: Admin, discordUserId: string) {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  return data?.id ?? null;
}

async function closeSession(admin: Admin, id: string, at: string) {
  const { data } = await admin
    .from("discord_voice_sessions")
    .select("joined_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  const seconds = Math.max(
    0,
    Math.round((new Date(at).getTime() - new Date(data.joined_at).getTime()) / 1000),
  );
  await admin.from("discord_voice_sessions").update({ left_at: at, seconds }).eq("id", id);
}

/** Open a voice session (idempotent for an already-open session in the same channel). */
export async function voiceJoin(
  admin: Admin,
  guildId: string,
  entry: ActiveVoiceEntry,
  at: string,
) {
  const { data: open } = await admin
    .from("discord_voice_sessions")
    .select("id, channel_id")
    .eq("discord_user_id", entry.discord_user_id)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1);

  const current = open?.[0];
  if (current) {
    if (current.channel_id === entry.channel_id) return;
    await closeSession(admin, current.id, at);
  }

  await admin.from("discord_voice_sessions").insert({
    guild_id: guildId,
    channel_id: entry.channel_id,
    channel_name: entry.channel_name ?? null,
    discord_user_id: entry.discord_user_id,
    discord_username: entry.discord_username ?? null,
    user_id: await resolveUserId(admin, entry.discord_user_id),
    joined_at: at,
  });
}

/** Close the newest open session of a user. */
export async function voiceLeave(admin: Admin, discordUserId: string, at: string) {
  const { data } = await admin
    .from("discord_voice_sessions")
    .select("id")
    .eq("discord_user_id", discordUserId)
    .is("left_at", null)
    .order("joined_at", { ascending: false })
    .limit(1);
  const id = data?.[0]?.id;
  if (id) await closeSession(admin, id, at);
}

/**
 * Bring the DB in line with the bot's live view: close sessions of users who
 * are no longer connected, open missing ones (bot restart, lost events).
 */
export async function reconcileVoice(
  admin: Admin,
  guildId: string,
  active: ActiveVoiceEntry[],
  at: string,
) {
  const { data: open } = await admin
    .from("discord_voice_sessions")
    .select("id, discord_user_id, channel_id")
    .is("left_at", null);

  const activeByUser = new Map(active.map((a) => [a.discord_user_id, a]));
  const openByUser = new Map((open ?? []).map((o) => [o.discord_user_id, o]));

  for (const row of open ?? []) {
    const live = activeByUser.get(row.discord_user_id);
    if (!live || live.channel_id !== row.channel_id) {
      await closeSession(admin, row.id, at);
    }
  }
  for (const entry of active) {
    const row = openByUser.get(entry.discord_user_id);
    if (!row || row.channel_id !== entry.channel_id) {
      await voiceJoin(admin, guildId, entry, at);
    }
  }
}

export async function logActivityEvent(
  admin: Admin,
  guildId: string,
  input: {
    event_type: string;
    discord_user_id: string;
    discord_username?: string | null;
    channel_id?: string | null;
    channel_name?: string | null;
    meta?: Record<string, unknown>;
    created_at?: string;
  },
) {
  const createdAt = input.created_at ?? new Date().toISOString();

  // Spam-Schutz für Nachrichten: min. 10 Zeichen und 10 Sekunden Cooldown.
  if (input.event_type === "message") {
    const len = Number((input.meta as Record<string, unknown> | undefined)?.["length"] ?? 0);
    if (!Number.isFinite(len) || len < MESSAGE_MIN_CHARS) return;
    const { data: last } = await admin
      .from("discord_activity_events")
      .select("created_at")
      .eq("discord_user_id", input.discord_user_id)
      .eq("event_type", "message")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      last?.created_at &&
      new Date(createdAt).getTime() - new Date(last.created_at).getTime() <
        MESSAGE_COOLDOWN_SECONDS * 1000
    ) {
      return;
    }
  }

  const { error } = await admin.from("discord_activity_events").insert({
    guild_id: guildId,
    event_type: input.event_type,
    discord_user_id: input.discord_user_id,
    discord_username: input.discord_username ?? null,
    channel_id: input.channel_id ?? null,
    channel_name: input.channel_name ?? null,
    meta: (input.meta ?? {}) as never,
    created_at: createdAt,
  });
  // 23505 = duplicate reaction (unique index); silently ignored.
  if (error && error.code !== "23505") console.error("logActivityEvent failed", error.message);
}

/** Hand pending backoffice commands to the bot and mark them as running. */
/** Message IDs of running giveaways whose reactions the bot must police. */
export async function runningGiveawayMessages(admin: Admin) {
  const { data } = await admin
    .from("giveaways")
    .select("id, announced_message_id")
    .eq("status", "running")
    .not("announced_message_id", "is", null)
    .limit(50);
  return (data ?? []).map((g) => g.announced_message_id as string);
}

/** Adds or removes a giveaway signup triggered by the ✅ reaction. */
export async function setGiveawayOptIn(
  admin: Admin,
  messageId: string,
  discordUserId: string,
  join: boolean,
) {
  const { data: g } = await admin
    .from("giveaways")
    .select("id")
    .eq("announced_message_id", messageId)
    .eq("status", "running")
    .maybeSingle();
  if (!g) return { ok: false };

  if (!join) {
    await admin
      .from("giveaway_optins")
      .delete()
      .eq("giveaway_id", g.id)
      .eq("discord_user_id", discordUserId);
    return { ok: true };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("discord_user_id", discordUserId)
    .maybeSingle();
  const { error } = await admin
    .from("giveaway_optins")
    .upsert(
      { giveaway_id: g.id, discord_user_id: discordUserId, user_id: profile?.id ?? null },
      { onConflict: "giveaway_id,discord_user_id" },
    );
  if (error) console.error("giveaway opt-in failed", error.message);
  return { ok: true };
}

export async function claimCommands(admin: Admin) {
  const { data } = await admin
    .from("discord_bot_commands")
    .select("id, command, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  const rows = data ?? [];
  if (rows.length) {
    await admin
      .from("discord_bot_commands")
      .update({ status: "running", picked_at: new Date().toISOString() })
      .in(
        "id",
        rows.map((r) => r.id),
      );
  }
  return rows;
}