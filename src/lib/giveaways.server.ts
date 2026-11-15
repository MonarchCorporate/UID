/**
 * Giveaway ticket calculation + weighted draw.
 * Activity comes from the external Discord gateway bot
 * (discord_voice_sessions + discord_activity_events).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
export type Giveaway = Database["public"]["Tables"]["giveaways"]["Row"];

export type Standing = {
  user_id: string;
  discord_user_id: string;
  name: string;
  callsign: string | null;
  rsi_handle: string | null;
  voice_seconds: number;
  messages: number;
  reactions: number;
  points: number;
  tickets: number;
};

const AFK = /(afk|abwesend|pause)/i;

/** Emoji members react with to join a giveaway. */
export const OPT_IN_EMOJI = "✅";

/** Discord IDs that actively signed up via the announcement reaction. */
export async function optedInDiscordIds(admin: Admin, giveawayId: string) {
  const { data } = await admin
    .from("giveaway_optins")
    .select("discord_user_id")
    .eq("giveaway_id", giveawayId)
    .limit(10_000);
  return new Set((data ?? []).map((r) => r.discord_user_id));
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

/** Participants: verified backoffice users (Discord linked + RSI verified). */
async function eligibleProfiles(admin: Admin, orgId: string | null) {
  let q = admin
    .from("profiles")
    .select("id, callsign, display_name, discord_user_id, rsi_handle")
    .not("discord_user_id", "is", null)
    .not("rsi_verified_at", "is", null);
  const { data } = await q;
  let rows = data ?? [];
  if (orgId) {
    const { data: members } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId);
    const allowed = new Set((members ?? []).map((m) => m.user_id));
    rows = rows.filter((p) => allowed.has(p.id));
  }
  return rows;
}

/** Computes points and tickets for every eligible member within the period. */
export async function computeStandings(admin: Admin, g: Giveaway): Promise<Standing[]> {
  const start = new Date(g.starts_at).getTime();
  const end = Math.min(new Date(g.ends_at).getTime(), Date.now());
  if (!(end > start)) return [];
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  const profiles = await eligibleProfiles(admin, g.org_id);
  if (!profiles.length) return [];
  let byDiscord = new Map(profiles.map((p) => [p.discord_user_id as string, p]));
  // Teilnahme nur nach aktiver Anmeldung per ✅-Reaktion auf die Ankündigung.
  if (g.announced_message_id) {
    const optIn = await optedInDiscordIds(admin, g.id);
    byDiscord = new Map([...byDiscord].filter(([id]) => optIn.has(id)));
    if (!byDiscord.size) return [];
  }

  const [sessionsRes, eventsRes] = await Promise.all([
    admin
      .from("discord_voice_sessions")
      .select("discord_user_id, channel_name, joined_at, left_at")
      .lte("joined_at", endIso)
      .or(`left_at.is.null,left_at.gte.${startIso}`)
      .limit(50_000),
    admin
      .from("discord_activity_events")
      .select("discord_user_id, event_type, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .in("event_type", ["message", "reaction"])
      .limit(100_000),
  ]);

  const voice = new Map<string, number>();
  for (const s of sessionsRes.data ?? []) {
    if (!byDiscord.has(s.discord_user_id)) continue;
    if (s.channel_name && AFK.test(s.channel_name)) continue;
    const from = new Date(s.joined_at).getTime();
    const to = s.left_at ? new Date(s.left_at).getTime() : Date.now();
    const full = Math.round((to - from) / 1000);
    if (full < g.min_voice_session_seconds) continue;
    const overlap = Math.min(to, end) - Math.max(from, start);
    if (overlap <= 0) continue;
    voice.set(
      s.discord_user_id,
      (voice.get(s.discord_user_id) ?? 0) + Math.round(overlap / 1000),
    );
  }

  // Daily caps against spam
  const perDay = new Map<string, { message: number; reaction: number }>();
  const msgs = new Map<string, number>();
  const reacts = new Map<string, number>();
  for (const e of eventsRes.data ?? []) {
    if (!byDiscord.has(e.discord_user_id)) continue;
    const key = `${e.discord_user_id}|${dayKey(e.created_at)}`;
    const bucket = perDay.get(key) ?? { message: 0, reaction: 0 };
    const kind = e.event_type === "reaction" ? "reaction" : "message";
    const cap = kind === "reaction" ? g.daily_reaction_cap : g.daily_message_cap;
    if (bucket[kind] >= cap) continue;
    bucket[kind] += 1;
    perDay.set(key, bucket);
    const target = kind === "reaction" ? reacts : msgs;
    target.set(e.discord_user_id, (target.get(e.discord_user_id) ?? 0) + 1);
  }

  const perTicket = Number(g.points_per_ticket) || 1;
  const out: Standing[] = [];
  for (const [discordId, p] of byDiscord) {
    const voiceSeconds = voice.get(discordId) ?? 0;
    const messages = msgs.get(discordId) ?? 0;
    const reactions = reacts.get(discordId) ?? 0;
    const points =
      (voiceSeconds / 60) * Number(g.points_per_voice_minute) +
      messages * Number(g.points_per_message) +
      reactions * Number(g.points_per_reaction);
    if (points <= 0 || points < Number(g.min_points)) continue;
    const tickets = Math.min(g.max_tickets, Math.floor(points / perTicket));
    // 0-Los-Teilnehmer bleiben sichtbar (Fortschritt), nehmen aber nicht an der Ziehung teil.
    out.push({
      user_id: p.id,
      discord_user_id: discordId,
      name: p.rsi_handle ?? p.display_name ?? p.callsign,
      callsign: p.callsign,
      rsi_handle: p.rsi_handle ?? null,
      voice_seconds: voiceSeconds,
      messages,
      reactions,
      points: Math.round(points * 10) / 10,
      tickets,
    });
  }
  out.sort((a, b) => b.tickets - a.tickets || b.points - a.points);
  return out;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Weighted draw without repeats; deterministic for a given seed. */
export function drawWinners(standings: Standing[], count: number, seed: string) {
  const rnd = mulberry32(hash(seed));
  const pool = standings.filter((s) => s.tickets > 0);
  const total = pool.reduce((s, x) => s + x.tickets, 0);
  const winners: { standing: Standing; place: number; total_tickets: number }[] = [];
  for (let place = 1; place <= count && pool.length; place++) {
    const sum = pool.reduce((s, x) => s + x.tickets, 0);
    let roll = rnd() * sum;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.tickets;
      if (roll <= 0) {
        idx = i;
        break;
      }
      idx = i;
    }
    const [picked] = pool.splice(idx, 1);
    if (picked) winners.push({ standing: picked, place, total_tickets: total });
  }
  return winners;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export function announceEmbed(g: Giveaway) {
  return {
    title: `🎟️ Gewinnspiel: ${g.title}`,
    description: g.description || undefined,
    color: 0x5865f2,
    fields: [
      { name: "Preis", value: g.prize || "—", inline: true },
      { name: "Gewinner", value: String(g.winner_count), inline: true },
      { name: "Zeitraum", value: `${fmtDate(g.starts_at)} – ${fmtDate(g.ends_at)}`, inline: false },
      {
        name: "Lose verdienen",
        value:
          `1 Min Voice = ${g.points_per_voice_minute} P · 1 Nachricht = ${g.points_per_message} P · ` +
          `1 Reaktion = ${g.points_per_reaction} P\n${g.points_per_ticket} Punkte = 1 Los (max. ${g.max_tickets} Lose)`,
      },
      {
        name: "Teilnahme",
        value:
          `Mit ${OPT_IN_EMOJI} unter dieser Nachricht reagieren, um teilzunehmen. ` +
          "Voraussetzung: Discord verknüpft und RSI-Account im Backoffice verifiziert.",
      },
    ],
    footer: { text: "UID Backoffice" },
    timestamp: new Date().toISOString(),
  };
}

export function winnerEmbed(
  g: Giveaway,
  winners: { standing: Standing; place: number; total_tickets: number }[],
) {
  return {
    title: `🏆 Gewinner: ${g.title}`,
    description: g.prize ? `Preis: **${g.prize}**` : undefined,
    color: 0xf1c40f,
    fields: winners.length
      ? winners.map((w) => ({
          name: `Platz ${w.place}`,
          value: `<@${w.standing.discord_user_id}> · ${w.standing.tickets} von ${w.total_tickets} Losen`,
        }))
      : [{ name: "Keine Teilnehmer", value: "Es hat niemand genug Punkte gesammelt." }],
    footer: { text: "Gezogen im UID Backoffice" },
    timestamp: new Date().toISOString(),
  };
}

/** Runs the draw, stores snapshot + winners and posts the Discord embed. */
export async function performDraw(admin: Admin, g: Giveaway) {
  if (g.status === "drawn") throw new Error("Dieses Gewinnspiel wurde bereits ausgelost.");
  if (g.status === "cancelled") throw new Error("Dieses Gewinnspiel wurde abgebrochen.");

  const standings = await computeStandings(admin, g);
  const seed = `${g.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const winners = drawWinners(standings, g.winner_count, seed);
  const drawnAt = new Date().toISOString();

  await admin.from("giveaway_entries").delete().eq("giveaway_id", g.id);
  if (standings.length) {
    await admin.from("giveaway_entries").insert(
      standings.map((s) => ({
        giveaway_id: g.id,
        user_id: s.user_id,
        discord_user_id: s.discord_user_id,
        voice_seconds: s.voice_seconds,
        messages: s.messages,
        reactions: s.reactions,
        points: s.points,
        tickets: s.tickets,
      })),
    );
  }
  await admin.from("giveaway_winners").delete().eq("giveaway_id", g.id);
  if (winners.length) {
    await admin.from("giveaway_winners").insert(
      winners.map((w) => ({
        giveaway_id: g.id,
        user_id: w.standing.user_id,
        place: w.place,
        tickets: w.standing.tickets,
        total_tickets: w.total_tickets,
      })),
    );
  }
  await admin
    .from("giveaways")
    .update({ status: "drawn", drawn_at: drawnAt, draw_seed: seed })
    .eq("id", g.id);

  if (g.announce_channel_id) {
    try {
      const { postEmbed } = await import("@/lib/discord.server");
      const ping = winners.map((w) => `<@${w.standing.discord_user_id}>`).join(" ");
      await postEmbed(g.announce_channel_id, winnerEmbed(g, winners) as never, ping || undefined);
    } catch (e) {
      console.error("giveaway winner post failed", e);
    }
  }

  return { standings, winners };
}
