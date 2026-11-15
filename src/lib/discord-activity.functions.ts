import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAppAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Nur App-Admins dürfen die Discord-Aktivität einsehen.");
  return supabaseAdmin;
}

export type BotStatus = {
  online: boolean;
  bot_username: string | null;
  guild_name: string | null;
  version: string | null;
  member_count: number | null;
  voice_active: number | null;
  last_heartbeat_at: string | null;
  stale: boolean;
};

export type VoiceLeader = {
  discord_user_id: string;
  name: string;
  callsign: string | null;
  seconds: number;
  sessions: number;
};

export type ChannelUsage = { channel_name: string; seconds: number; sessions: number };

export type ActivityOverview = {
  status: BotStatus;
  days: number;
  totalSeconds: number;
  uniqueUsers: number;
  leaders: VoiceLeader[];
  channels: ChannelUsage[];
  live: { name: string; channel_name: string; since: string }[];
  events: {
    id: string;
    event_type: string;
    name: string;
    channel_name: string | null;
    created_at: string;
  }[];
  commands: {
    id: string;
    command: string;
    status: string;
    result: string | null;
    created_at: string;
  }[];
};

export const getDiscordActivityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: z.number().int().min(1).max(90) }).parse(i))
  .handler(async ({ data, context }): Promise<ActivityOverview> => {
    const admin = await assertAppAdmin(context.userId);
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const now = Date.now();

    const [statusRes, sessionsRes, eventsRes, commandsRes] = await Promise.all([
      admin.from("discord_bot_status").select("*").eq("id", "default").maybeSingle(),
      admin
        .from("discord_voice_sessions")
        .select("discord_user_id, discord_username, channel_name, joined_at, left_at, seconds")
        .gte("joined_at", since)
        .order("joined_at", { ascending: false })
        .limit(5000),
      admin
        .from("discord_activity_events")
        .select("id, event_type, discord_username, discord_user_id, channel_name, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("discord_bot_commands")
        .select("id, command, status, result, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const sessions = sessionsRes.data ?? [];
    const discordIds = Array.from(new Set(sessions.map((s) => s.discord_user_id)));
    const callsigns = new Map<string, string>();
    if (discordIds.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("discord_user_id, callsign")
        .in("discord_user_id", discordIds);
      for (const p of profiles ?? []) {
        if (p.discord_user_id) callsigns.set(p.discord_user_id, p.callsign);
      }
    }

    const secondsOf = (s: (typeof sessions)[number]) =>
      s.seconds ??
      Math.max(0, Math.round((now - new Date(s.joined_at).getTime()) / 1000));

    const byUser = new Map<string, VoiceLeader>();
    const byChannel = new Map<string, ChannelUsage>();
    let totalSeconds = 0;

    for (const s of sessions) {
      const secs = secondsOf(s);
      totalSeconds += secs;
      const key = s.discord_user_id;
      const entry = byUser.get(key) ?? {
        discord_user_id: key,
        name: s.discord_username ?? key,
        callsign: callsigns.get(key) ?? null,
        seconds: 0,
        sessions: 0,
      };
      entry.seconds += secs;
      entry.sessions += 1;
      byUser.set(key, entry);

      const cname = s.channel_name ?? "Unbekannter Kanal";
      const ch = byChannel.get(cname) ?? { channel_name: cname, seconds: 0, sessions: 0 };
      ch.seconds += secs;
      ch.sessions += 1;
      byChannel.set(cname, ch);
    }

    const status = statusRes.data;
    const lastBeat = status?.last_heartbeat_at ? new Date(status.last_heartbeat_at).getTime() : 0;
    const stale = !lastBeat || now - lastBeat > 3 * 60_000;

    return {
      status: {
        online: Boolean(status?.online) && !stale,
        bot_username: status?.bot_username ?? null,
        guild_name: status?.guild_name ?? null,
        version: status?.version ?? null,
        member_count: status?.member_count ?? null,
        voice_active: status?.voice_active ?? null,
        last_heartbeat_at: status?.last_heartbeat_at ?? null,
        stale,
      },
      days: data.days,
      totalSeconds,
      uniqueUsers: byUser.size,
      leaders: [...byUser.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 15),
      channels: [...byChannel.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 10),
      live: sessions
        .filter((s) => !s.left_at)
        .map((s) => ({
          name: callsigns.get(s.discord_user_id) ?? s.discord_username ?? s.discord_user_id,
          channel_name: s.channel_name ?? "—",
          since: s.joined_at,
        })),
      events: (eventsRes.data ?? []).map((e) => ({
        id: e.id,
        event_type: e.event_type,
        name: callsigns.get(e.discord_user_id) ?? e.discord_username ?? e.discord_user_id,
        channel_name: e.channel_name,
        created_at: e.created_at,
      })),
      commands: commandsRes.data ?? [],
    };
  });

/** Queue a control command; the bot picks it up with its next heartbeat. */
export const queueBotCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        command: z.enum([
          "ping",
          "resync_voice",
          "set_presence",
          "post_message",
          "restart",
        ]),
        payload: z.record(z.string(), z.string()).default({}),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAppAdmin(context.userId);
    const { error } = await admin.from("discord_bot_commands").insert({
      command: data.command,
      payload: data.payload as never,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });