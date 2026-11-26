import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server functions for the Companion pages (pairing, devices, live status,
// session plan, contracts, mining spots). Server-only modules are imported
// lazily so they never end up in the client bundle.

export const getCompanionPairing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(4).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { getPairing } = await import("@/lib/companion/api.server");
    return getPairing(data.code);
  });

export const approveCompanionPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => z.object({ code: z.string().min(4).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { approvePairing } = await import("@/lib/companion/api.server");
    return approvePairing(context.userId, data.code);
  });

export const getCompanionDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { q, q1 } = await import("@/lib/companion/db.server");
    const { summarize } = await import("@/lib/companion/ingest.server");
    const { placeName, shipName } = await import("@/lib/companion/names");
    const uid = context.userId;
    const [devices, live, events, sessions, contracts] = await Promise.all([
      q("SELECT id, name, token_prefix, version, os, channel, game_running, player_handle, last_seen, events_total, revoked, created_at FROM companion_devices WHERE user_id = ? ORDER BY revoked, last_seen DESC", [uid]),
      q1("SELECT * FROM companion_live WHERE user_id = ?", [uid]),
      q("SELECT id, type, summary, data, occurred_at FROM companion_events WHERE user_id = ? ORDER BY id DESC LIMIT 60", [uid]),
      q("SELECT * FROM companion_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20", [uid]),
      q("SELECT * FROM companion_contracts WHERE user_id = ? ORDER BY (status = 'aktiv') DESC, accepted_at DESC LIMIT 50", [uid]),
    ]);
    const now = Date.now();
    const toMs = (v: unknown) => (v ? new Date(String(v).replace(" ", "T") + "Z").getTime() : 0);
    return {
      devices: devices.map((d) => ({
        id: Number(d.id), name: String(d.name), prefix: String(d.token_prefix), version: d.version ?? null, channel: d.channel ?? null,
        player: d.player_handle ?? null, events: Number(d.events_total), revoked: !!d.revoked,
        connected: !d.revoked && now - toMs(d.last_seen) < 3 * 60_000, in_game: !!d.game_running, last_seen: d.last_seen ?? null,
      })),
      live: live
        ? { handle: live.handle ?? null, location: live.location ? placeName(live.location) : null, ship: live.ship ? shipName(live.ship) : null, in_ship: !!live.in_ship, shard: live.shard ?? null, online: !!live.online && now - toMs(live.updated_at) < 30 * 60_000, updated_at: live.updated_at }
        : null,
      events: events.map((e) => ({ id: Number(e.id), type: String(e.type), summary: String(e.summary ?? summarize({ type: String(e.type), data: JSON.parse(String(e.data ?? "{}")) })), at: String(e.occurred_at) })),
      sessions: sessions.map((s) => ({ session: String(s.session), player: s.player ?? null, channel: s.channel ?? null, branch: s.branch ?? null, started_at: String(s.started_at), ended_at: s.ended_at ?? null, last_event_at: String(s.last_event_at), kills: Number(s.kills), npc_kills: Number(s.npc_kills), deaths: Number(s.deaths), events: Number(s.events) })),
      contracts: contracts.map((c) => ({ id: Number(c.id), title: String(c.title), status: String(c.status), accepted_at: String(c.accepted_at), ended_at: c.ended_at ?? null })),
    };
  });

export const revokeCompanionDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { run } = await import("@/lib/companion/db.server");
    await run("UPDATE companion_devices SET revoked = 1 WHERE id = ? AND user_id = ?", [data.id, context.userId]);
    return { ok: true };
  });

export const getCompanionPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { planList } = await import("@/lib/companion/plan.server");
    return planList(context.userId);
  });

export const companionPlanOp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) =>
    z.object({
      op: z.enum(["add", "toggle", "up", "down", "delete", "clear_done"]),
      id: z.number().int().optional(),
      title: z.string().max(150).optional(),
      quantity: z.number().int().min(1).max(100000).optional(),
      location: z.string().max(150).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { planApply, planList } = await import("@/lib/companion/plan.server");
    await planApply(context.userId, data);
    return planList(context.userId);
  });

export const listMiningSpots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { q } = await import("@/lib/companion/db.server");
    const rows = await q("SELECT s.*, p.display_name, p.callsign FROM mining_spots s LEFT JOIN profiles p ON p.id = s.created_by ORDER BY s.mineral, s.location");
    return rows.map((r) => ({ id: Number(r.id), mineral: String(r.mineral), location: String(r.location), star_system: r.star_system ?? null, method: String(r.method), notes: r.notes ?? null, by: r.display_name || r.callsign || null, mine: false, created_by: r.created_by ?? null }));
  });

export const addMiningSpot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) =>
    z.object({
      mineral: z.string().min(2).max(100),
      location: z.string().min(2).max(150),
      star_system: z.string().max(60).optional(),
      method: z.enum(["ship", "roc", "hand"]).default("ship"),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { run, sqlDate } = await import("@/lib/companion/db.server");
    await run("INSERT INTO mining_spots (mineral, location, star_system, method, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [data.mineral.trim(), data.location.trim(), data.star_system?.trim() || null, data.method, data.notes?.trim() || null, context.userId, sqlDate()]);
    return { ok: true };
  });

export const deleteMiningSpot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: number }) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { run, q1 } = await import("@/lib/companion/db.server");
    const admin = await q1("SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role = 'admin'", [context.userId]);
    await run(`DELETE FROM mining_spots WHERE id = ?${admin ? "" : " AND created_by = ?"}`, admin ? [data.id] : [data.id, context.userId]);
    return { ok: true };
  });
