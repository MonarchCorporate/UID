import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomCode, randomToken, resolveSeedForCommander, verifyBoardMember } from "./board.server";

const SESSION_STATUSES = ["standby", "in_flight", "docked"] as const;
const CARGO_STATUSES = ["loaded", "unloaded", "lost"] as const;
const CARGO_UNITS = ["pcs", "scu"] as const;

// ---------- Commander: create / list / delete ----------

export const listMyBoardSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("board_sessions")
      .select("id, code, ship_slug, ship_name, custom_name, status, created_at, updated_at, mission_id")
      .eq("commander_id", userId)
      .is("mission_id", null)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createBoardSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ship_slug: z.string().min(1).max(120).nullable().optional(),
      ship_name: z.string().min(1).max(120),
      custom_name: z.string().max(80).optional().nullable(),
      cargo_cap_scu: z.number().int().min(0).max(100000).optional().nullable(),
      crew_cap: z.number().int().min(1).max(200).optional().nullable(),
      commander_display_name: z.string().min(1).max(60),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // unique code
    let code = randomCode();
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await supabaseAdmin
        .from("board_sessions").select("id").eq("code", code).maybeSingle();
      if (!exists) break;
      code = randomCode();
    }
    const { data: session, error } = await supabaseAdmin
      .from("board_sessions")
      .insert({
        code,
        commander_id: userId,
        ship_slug: data.ship_slug ?? null,
        ship_name: data.ship_name,
        custom_name: data.custom_name ?? null,
        cargo_cap_scu: data.cargo_cap_scu ?? null,
        crew_cap: data.crew_cap ?? null,
        status: "standby",
      })
      .select("id, code")
      .single();
    if (error || !session) throw new Error(error?.message || "Konnte Session nicht anlegen");

    // commander member entry
    await supabaseAdmin.from("board_members").insert({
      session_id: session.id,
      user_id: userId,
      display_name: data.commander_display_name,
      token: randomToken(),
      is_commander: true,
    });

    // seed stations + ship meta (User template > Admin template > Fleetyards)
    const { stations: seeds, meta } = await resolveSeedForCommander(userId, data.ship_slug ?? null);
    if (seeds.length > 0) {
      await supabaseAdmin.from("board_stations").insert(
        seeds.map((s) => ({
          session_id: session.id,
          slot_key: s.slot_key,
          label: s.label,
          hardpoint_name: s.hardpoint_name,
          category: s.category,
          sort_order: s.sort_order,
          is_manual: false,
        })),
      );
    }
    await supabaseAdmin
      .from("board_sessions")
      .update({ ship_meta: meta as unknown as never })
      .eq("id", session.id);

    return session;
  });

export const deleteBoardSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ session_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: s } = await supabaseAdmin
      .from("board_sessions").select("id, commander_id").eq("id", data.session_id).maybeSingle();
    if (!s || s.commander_id !== userId) throw new Error("Nur der Kommandant darf löschen.");
    const { error } = await supabaseAdmin.from("board_sessions").delete().eq("id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reseedStations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ session_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: s } = await supabaseAdmin
      .from("board_sessions").select("id, commander_id, ship_slug").eq("id", data.session_id).maybeSingle();
    if (!s || s.commander_id !== userId) throw new Error("Nur der Kommandant darf das Schiff re-seed.");
    // Only delete auto-generated stations; preserve manual ones.
    await supabaseAdmin
      .from("board_stations")
      .delete()
      .eq("session_id", data.session_id)
      .eq("is_manual", false);
    const { stations: seeds, meta } = await resolveSeedForCommander(userId, s.ship_slug ?? null);
    if (seeds.length > 0) {
      await supabaseAdmin.from("board_stations").insert(
        seeds.map((x) => ({
          session_id: data.session_id,
          slot_key: x.slot_key,
          label: x.label,
          hardpoint_name: x.hardpoint_name,
          category: x.category,
          sort_order: x.sort_order,
          is_manual: false,
        })),
      );
    }
    await supabaseAdmin
      .from("board_sessions")
      .update({ ship_meta: meta as unknown as never })
      .eq("id", data.session_id);
    return { ok: true, stations: seeds.length };
  });

// Commander-only: add a custom station (e.g. for ships without Fleetyards data).
export const addStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      label: z.string().min(1).max(80),
      category: z.enum(["seat", "turret"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await supabaseAdmin
      .from("board_sessions").select("id, commander_id").eq("id", data.session_id).maybeSingle();
    if (!s || s.commander_id !== context.userId) throw new Error("Nur der Kommandant darf Stationen hinzufügen.");
    const { data: last } = await supabaseAdmin
      .from("board_stations")
      .select("sort_order")
      .eq("session_id", data.session_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (last?.sort_order ?? -1) + 1;
    const slot = `manual_${Date.now().toString(36)}`;
    const { error } = await supabaseAdmin.from("board_stations").insert({
      session_id: data.session_id,
      slot_key: slot,
      label: data.label,
      hardpoint_name: null,
      category: data.category,
      sort_order: nextOrder,
      is_manual: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      station_id: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await supabaseAdmin
      .from("board_sessions").select("id, commander_id").eq("id", data.session_id).maybeSingle();
    if (!s || s.commander_id !== context.userId) throw new Error("Nur der Kommandant darf Stationen entfernen.");
    const { error } = await supabaseAdmin
      .from("board_stations")
      .delete()
      .eq("id", data.station_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Public: join / read ----------

export const getBoardByCode = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      code: z.string().min(1).max(20),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const codeUpper = data.code.toUpperCase();
    const { data: s, error } = await supabaseAdmin
      .from("board_sessions")
      .select("id, code, ship_slug, ship_name, custom_name, status, cargo_cap_scu, crew_cap, commander_id")
      .eq("code", codeUpper)
      .maybeSingle();
    if (error || !s) throw new Error("Boardcomputer nicht gefunden");
    return s;
  });

// Returns the commander's member token for a session (only if the caller is the commander).
export const getCommanderToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ code: z.string().min(1).max(20) }).parse(i))
  .handler(async ({ data, context }) => {
    const codeUpper = data.code.toUpperCase();
    const { data: s } = await supabaseAdmin
      .from("board_sessions")
      .select("id, commander_id")
      .eq("code", codeUpper)
      .maybeSingle();
    if (!s) throw new Error("Boardcomputer nicht gefunden");
    if (s.commander_id !== context.userId) {
      throw new Error("Du bist nicht der Kommandant dieser Session.");
    }
    const { data: m } = await supabaseAdmin
      .from("board_members")
      .select("id, token, display_name")
      .eq("session_id", s.id)
      .eq("user_id", context.userId)
      .eq("is_commander", true)
      .maybeSingle();
    if (!m) throw new Error("Kommandanten-Eintrag fehlt.");
    return { session_id: s.id, member_id: m.id, token: m.token, display_name: m.display_name };
  });

export const joinBoardSession = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      code: z.string().min(1).max(20),
      display_name: z.string().min(1).max(60),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { getOptionalUserId } = await import("./optional-auth.server");
    const userId = await getOptionalUserId();
    const codeUpper = data.code.toUpperCase();
    const { data: s } = await supabaseAdmin
      .from("board_sessions").select("id").eq("code", codeUpper).maybeSingle();
    if (!s) throw new Error("Boardcomputer nicht gefunden");

    if (userId) {
      const { data: existing } = await supabaseAdmin
        .from("board_members")
        .select("id, token")
        .eq("session_id", s.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("board_members")
          .update({ display_name: data.display_name })
          .eq("id", existing.id);
        return { session_id: s.id, member_id: existing.id, token: existing.token };
      }
    }

    const token = randomToken();
    const { data: created, error } = await supabaseAdmin
      .from("board_members")
      .insert({
        session_id: s.id,
        user_id: userId,
        display_name: data.display_name,
        token,
      })
      .select("id, token")
      .single();
    if (error || !created) throw new Error(error?.message || "Beitritt fehlgeschlagen");
    return { session_id: s.id, member_id: created.id, token: created.token };
  });

export const getBoardState = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const [session, members, stations, cargo] = await Promise.all([
      supabaseAdmin
        .from("board_sessions")
        .select("id, code, ship_slug, ship_name, custom_name, status, cargo_cap_scu, crew_cap, commander_id, updated_at, ship_meta")
        .eq("id", data.session_id)
        .single(),
      supabaseAdmin
        .from("board_members")
        .select("id, user_id, display_name, is_commander, is_squad_lead, can_transfer_cargo, joined_at")
        .eq("session_id", data.session_id)
        .order("joined_at"),
      supabaseAdmin
        .from("board_stations")
        .select("id, slot_key, label, hardpoint_name, category, sort_order, assigned_member_id, notes, is_manual")
        .eq("session_id", data.session_id)
        .order("sort_order"),
      supabaseAdmin
        .from("board_cargo")
        .select("id, commodity, item_ref, item_name, item_kind, quality, unit, qty, scu, status, note, created_at, updated_at")
        .eq("session_id", data.session_id)
        .order("created_at"),
    ]);
    if (session.error || !session.data) throw new Error("Session nicht gefunden");
    return {
      session: session.data,
      members: members.data ?? [],
      stations: stations.data ?? [],
      cargo: cargo.data ?? [],
    };
  });

// ---------- Member mutations ----------

export const assignStation = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      station_id: z.string().uuid(),
      member_id: z.string().uuid().nullable(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const { error } = await supabaseAdmin
      .from("board_stations")
      .update({ assigned_member_id: data.member_id })
      .eq("id", data.station_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSessionStatus = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      status: z.enum(SESSION_STATUSES),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const { error } = await supabaseAdmin
      .from("board_sessions")
      .update({ status: data.status })
      .eq("id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveBoardSession = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    if (m.is_commander) throw new Error("Der Kommandant kann den Boardcomputer nicht verlassen.");
    await supabaseAdmin.from("board_members").delete().eq("id", m.id);
    return { ok: true };
  });

// Cargo
export const addCargo = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      commodity: z.string().min(1).max(120).optional(),
      item_ref: z.string().max(160).nullable().optional(),
      item_name: z.string().min(1).max(160).optional(),
      item_kind: z.string().max(80).nullable().optional(),
      unit: z.enum(CARGO_UNITS).optional(),
      qty: z.number().min(0).max(1000000).optional(),
      quality: z.number().int().min(0).max(1000).nullable().optional(),
      scu: z.number().min(0).max(1000000).optional(),
      status: z.enum(CARGO_STATUSES).optional(),
      note: z.string().max(200).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const name = (data.item_name ?? data.commodity ?? "").trim();
    if (!name) throw new Error("Item-Name fehlt.");
    const unit = data.unit ?? "scu";
    const qty = data.qty ?? data.scu ?? 0;
    if (qty <= 0) throw new Error("Menge muss > 0 sein.");
    const { error } = await supabaseAdmin.from("board_cargo").insert({
      session_id: data.session_id,
      commodity: name,
      item_ref: data.item_ref ?? null,
      item_name: name,
      item_kind: data.item_kind ?? null,
      unit,
      qty,
      quality: data.quality ?? null,
      // Keep legacy scu in sync when unit is scu, so old readers keep working.
      scu: unit === "scu" ? qty : 0,
      status: data.status ?? "loaded",
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCargo = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      cargo_id: z.string().uuid(),
      scu: z.number().min(0).max(1000000).optional(),
      qty: z.number().min(0).max(1000000).optional(),
      unit: z.enum(CARGO_UNITS).optional(),
      quality: z.number().int().min(0).max(1000).nullable().optional(),
      status: z.enum(CARGO_STATUSES).optional(),
      note: z.string().max(200).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const patch: {
      qty?: number;
      scu?: number;
      unit?: (typeof CARGO_UNITS)[number];
      quality?: number | null;
      status?: (typeof CARGO_STATUSES)[number];
      note?: string | null;
    } = {};
    if (data.qty !== undefined) {
      patch.qty = data.qty;
      patch.scu = data.qty; // keep legacy in sync
    } else if (data.scu !== undefined) {
      patch.scu = data.scu;
      patch.qty = data.scu;
    }
    if (data.unit !== undefined) patch.unit = data.unit;
    if (data.quality !== undefined) patch.quality = data.quality;
    if (data.status !== undefined) patch.status = data.status;
    if (data.note !== undefined) patch.note = data.note;
    const { error } = await supabaseAdmin
      .from("board_cargo")
      .update(patch)
      .eq("id", data.cargo_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCargo = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      cargo_id: z.string().uuid(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const { error } = await supabaseAdmin
      .from("board_cargo")
      .delete()
      .eq("id", data.cargo_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Transfer permission (commander-only) ----------

export const setMemberTransferPermission = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      member_id: z.string().uuid(),
      can_transfer: z.boolean(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const me = await verifyBoardMember(data.session_id, data.token);
    if (!me.is_commander) throw new Error("Nur der Kommandant darf Berechtigungen setzen.");
    const { error } = await supabaseAdmin
      .from("board_members")
      .update({ can_transfer_cargo: data.can_transfer })
      .eq("id", data.member_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Transfer cargo → member private inventory ----------

export const transferCargoToMember = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      cargo_id: z.string().uuid(),
      target_member_id: z.string().uuid(),
      qty: z.number().positive().max(1000000),
      location_id: z.string().uuid().nullable().optional(),
      location_label: z.string().max(160).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const me = await verifyBoardMember(data.session_id, data.token);
    // Fetch caller's permission flag
    const { data: caller } = await supabaseAdmin
      .from("board_members")
      .select("can_transfer_cargo, is_commander")
      .eq("id", me.id)
      .maybeSingle();
    const allowed = !!(caller?.is_commander || caller?.can_transfer_cargo);
    if (!allowed) throw new Error("Keine Berechtigung, Ladung zu übergeben.");

    // Target member must be a signed-in user in the same session
    const { data: target } = await supabaseAdmin
      .from("board_members")
      .select("id, user_id, display_name, session_id")
      .eq("id", data.target_member_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (!target) throw new Error("Ziel-Mitglied nicht gefunden.");
    if (!target.user_id) {
      throw new Error("Ziel-Mitglied ist nicht angemeldet — Inventar-Übergabe nicht möglich.");
    }

    // Fetch cargo row
    const { data: row, error: cargoErr } = await supabaseAdmin
      .from("board_cargo")
      .select("id, session_id, item_ref, item_name, item_kind, unit, qty, quality, commodity, scu")
      .eq("id", data.cargo_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (cargoErr || !row) throw new Error("Ladung nicht gefunden.");

    const currentQty = Number(row.qty ?? row.scu ?? 0);
    if (data.qty > currentQty + 0.0001) {
      throw new Error(`Nur ${currentQty} verfügbar.`);
    }
    const name = (row.item_name ?? row.commodity ?? "").trim();
    if (!name) throw new Error("Ladung ohne Namen kann nicht übergeben werden.");
    const unit = (row.unit ?? "scu") as "pcs" | "scu";
    const quality = row.quality ?? null;
    const item_ref = row.item_ref ?? null;
    const item_kind = row.item_kind ?? null;

    // Merge into target's private inventory
    let mergeQ = supabaseAdmin
      .from("inventory_items")
      .select("id, qty")
      .eq("owner_id", target.user_id)
      .eq("item_name", name)
      .eq("unit", unit)
      .eq("visibility", "private");
    mergeQ = item_ref ? mergeQ.eq("item_ref", item_ref) : mergeQ.is("item_ref", null);
    mergeQ = quality != null ? mergeQ.eq("quality", quality) : mergeQ.is("quality", null);
    mergeQ = data.location_id ? mergeQ.eq("location_id", data.location_id) : mergeQ.is("location_id", null);
    const { data: existing } = await mergeQ.maybeSingle();

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("inventory_items")
        .update({ qty: Number(existing.qty ?? 0) + data.qty })
        .eq("id", existing.id as string);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("inventory_items").insert({
        owner_id: target.user_id,
        item_ref,
        item_name: name,
        item_kind,
        unit,
        qty: data.qty,
        quality,
        location_id: data.location_id ?? null,
        visibility: "private",
        notes: `Übergeben aus Board-Session`,
      });
      if (error) throw new Error(error.message);
    }

    // Deduct or delete cargo row
    const remaining = currentQty - data.qty;
    if (remaining <= 0.0001) {
      const { error } = await supabaseAdmin
        .from("board_cargo")
        .delete()
        .eq("id", row.id)
        .eq("session_id", data.session_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("board_cargo")
        .update({ qty: remaining, scu: unit === "scu" ? remaining : 0 })
        .eq("id", row.id)
        .eq("session_id", data.session_id);
      if (error) throw new Error(error.message);
    }

    return { ok: true, transferred: data.qty, remaining, target: target.display_name };
  });