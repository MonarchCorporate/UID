import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAppAdmin(userId: string) {
  const supabaseAdmin = await admin();
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Nur App-Admins dürfen Gewinnspiele verwalten.");
  return supabaseAdmin;
}

const settings = {
  title: z.string().min(2).max(120),
  description: z.string().max(2000).nullish(),
  prize: z.string().max(200).default(""),
  org_id: z.string().uuid().nullish(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  points_per_voice_minute: z.number().min(0).max(100),
  points_per_message: z.number().min(0).max(100),
  points_per_reaction: z.number().min(0).max(100),
  points_per_ticket: z.number().min(1).max(100_000),
  max_tickets: z.number().int().min(1).max(10_000),
  min_points: z.number().min(0).max(1_000_000),
  winner_count: z.number().int().min(1).max(25),
  announce_channel_id: z.string().max(32).nullish(),
};

export const listGiveaways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: isAdmin } = await db.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    let q = db.from("giveaways").select("*").order("ends_at", { ascending: false });
    if (!isAdmin) q = q.neq("status", "draft");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((g) => g.id);
    const { data: winners } = ids.length
      ? await db
          .from("giveaway_winners")
          .select("giveaway_id, user_id, place, tickets, total_tickets")
          .in("giveaway_id", ids)
      : { data: [] };
    const userIds = [...new Set((winners ?? []).map((w) => w.user_id))];
    const { data: profiles } = userIds.length
      ? await db.from("profiles").select("id, callsign, display_name").in("id", userIds)
      : { data: [] };
    const nameOf = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? p.callsign] as const),
    );
    return {
      isAdmin: Boolean(isAdmin),
      giveaways: (data ?? []).map((g) => ({
        ...g,
        winners: (winners ?? [])
          .filter((w) => w.giveaway_id === g.id)
          .sort((a, b) => a.place - b.place)
          .map((w) => ({ ...w, name: nameOf.get(w.user_id) ?? "Unbekannt" })),
      })),
    };
  });

/** Live ticket standing of a giveaway (admins: everyone, members: only themselves). */
export const getGiveawayStandings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: isAdmin } = await db.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: g } = await db.from("giveaways").select("*").eq("id", data.id).maybeSingle();
    if (!g) throw new Error("Gewinnspiel nicht gefunden.");
    if (g.status === "draft" && !isAdmin) throw new Error("Gewinnspiel nicht gefunden.");

    const { computeStandings } = await import("@/lib/giveaways.server");
    let standings;
    if (g.status === "drawn") {
      const { data: entries } = await db
        .from("giveaway_entries")
        .select("user_id, discord_user_id, voice_seconds, messages, reactions, points, tickets")
        .eq("giveaway_id", g.id);
      const ids = (entries ?? []).map((e) => e.user_id);
      const { data: profiles } = ids.length
        ? await db
            .from("profiles")
            .select("id, callsign, display_name, rsi_handle")
            .in("id", ids)
        : { data: [] };
      const p = new Map((profiles ?? []).map((x) => [x.id, x] as const));
      standings = (entries ?? [])
        .map((e) => ({
          user_id: e.user_id,
          discord_user_id: e.discord_user_id ?? "",
          name:
            p.get(e.user_id)?.rsi_handle ??
            p.get(e.user_id)?.display_name ??
            p.get(e.user_id)?.callsign ??
            "Unbekannt",
          callsign: p.get(e.user_id)?.callsign ?? null,
          rsi_handle: p.get(e.user_id)?.rsi_handle ?? null,
          voice_seconds: e.voice_seconds,
          messages: e.messages,
          reactions: e.reactions,
          points: Number(e.points),
          tickets: e.tickets,
        }))
        .sort((a, b) => b.tickets - a.tickets);
    } else {
      standings = await computeStandings(db, g);
    }

    const total = standings.reduce((s, x) => s + x.tickets, 0);
    const mine = standings.find((s) => s.user_id === context.userId) ?? null;
    return {
      giveaway: g,
      total,
      mine: mine ? { ...mine, chance: total ? mine.tickets / total : 0 } : null,
      standings: isAdmin ? standings.slice(0, 200) : [],
    };
  });

export const createGiveaway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object(settings).parse(i))
  .handler(async ({ data, context }) => {
    const db = await assertAppAdmin(context.userId);
    const { data: row, error } = await db
      .from("giveaways")
      .insert({ ...data, created_by: context.userId, status: "draft" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateGiveaway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), ...settings }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await assertAppAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await db.from("giveaways").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelGiveaway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await assertAppAdmin(context.userId);
    const { error } = await db
      .from("giveaways")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGiveaway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await assertAppAdmin(context.userId);
    const { error } = await db.from("giveaways").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Publishes a draft giveaway and posts the Discord announcement embed. */
export const startGiveaway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await assertAppAdmin(context.userId);
    const { data: g } = await db.from("giveaways").select("*").eq("id", data.id).maybeSingle();
    if (!g) throw new Error("Gewinnspiel nicht gefunden.");
    if (g.status !== "draft") throw new Error("Dieses Gewinnspiel läuft bereits.");

    let messageId: string | null = null;
    let warning: string | null = null;
    if (g.announce_channel_id) {
      try {
        const { postEmbed, addOwnReaction } = await import("@/lib/discord.server");
        const { announceEmbed, OPT_IN_EMOJI } = await import("@/lib/giveaways.server");
        const res = await postEmbed(g.announce_channel_id, announceEmbed(g) as never);
        messageId = res.id;
        // Vorausgewähltes Häkchen, auf das Mitglieder klicken, um teilzunehmen.
        await addOwnReaction(g.announce_channel_id, res.id, OPT_IN_EMOJI).catch(() => {});
      } catch (e) {
        warning = e instanceof Error ? e.message : "Discord-Ankündigung fehlgeschlagen.";
      }
    }
    const { error } = await db
      .from("giveaways")
      .update({ status: "running", announced_message_id: messageId })
      .eq("id", g.id);
    if (error) throw new Error(error.message);
    return { ok: true, warning };
  });

export const drawGiveaway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await assertAppAdmin(context.userId);
    const { data: g } = await db.from("giveaways").select("*").eq("id", data.id).maybeSingle();
    if (!g) throw new Error("Gewinnspiel nicht gefunden.");
    const { performDraw } = await import("@/lib/giveaways.server");
    const { winners } = await performDraw(db, g);
    return { ok: true, winners: winners.map((w) => ({ name: w.standing.name, place: w.place })) };
  });

/** Discord text channels the bot may post into (reuses the org channel allowlist). */
export const listAnnounceChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context.userId);
    const { fetchGuildChannels } = await import("@/lib/discord.server");
    try {
      const channels = await fetchGuildChannels();
      return channels.map((c) => ({ id: c.id, name: c.name }));
    } catch {
      return [] as { id: string; name: string }[];
    }
  });

export const listOrgOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAppAdmin(context.userId);
    const { data } = await db.from("orgs").select("id, name").order("name");
    return data ?? [];
  });
