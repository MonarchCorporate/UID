import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin, randomSlug, randomToken, verifyParticipant } from "./missions.server";
import { userHasAnyOrgPerm } from "./org-perms.server";

/** Leader or org member with `missions.manage` may administer any mission. */
async function canManageMission(missionLeaderId: string | null, userId: string): Promise<boolean> {
  if (missionLeaderId && missionLeaderId === userId) return true;
  const admin = getAdmin();
  return userHasAnyOrgPerm(admin, userId, "missions.manage");
}

const SHIP_STATUSES = ["ready", "waiting_crew", "enroute_station", "enroute_mission", "disabled"] as const;
const MISSION_STATUSES = ["draft", "active", "completed", "cancelled"] as const;

// ---------- List public missions for calendar (no auth) ----------
export const listPublicMissions = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      include_internal: z.boolean().optional().default(false),
    }).optional().default({}).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const admin = getAdmin();
    const { getOptionalUserId } = await import("./optional-auth.server");
    const viewerId = await getOptionalUserId();
    let q = admin
      .from("missions")
      .select("id, slug, title, description, starts_at, status, category_id, show_participant_count, org_id, is_internal")
      .is("password_hash", null)
      .eq("show_in_calendar", true)
      .eq("is_hidden", false)
      .in("status", ["active", "draft"]);
    if (data.from) q = q.gte("starts_at", data.from);
    if (data.to) q = q.lte("starts_at", data.to);
    const { data: allRows, error } = await q.order("starts_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    // Interne Einsätze erscheinen nur im internen Kalender und nur für Mitglieder der Orga.
    let viewerOrgIds = new Set<string>();
    if (data.include_internal && viewerId) {
      const { data: memberships } = await admin
        .from("org_members")
        .select("org_id")
        .eq("user_id", viewerId);
      viewerOrgIds = new Set((memberships ?? []).map((m) => m.org_id as string));
    }
    const rows = (allRows ?? []).filter((r) => {
      if (!(r as { is_internal?: boolean }).is_internal) return true;
      if (!data.include_internal) return false;
      const oid = r.org_id as string | null;
      return !!oid && viewerOrgIds.has(oid);
    });
    const { data: cats } = await admin
      .from("mission_categories")
      .select("id, name, color");
    const catMap = new Map<string, { id: string; name: string; color: string }>();
    for (const c of cats ?? []) catMap.set(c.id as string, c as { id: string; name: string; color: string });
    const orgIds = Array.from(
      new Set((rows ?? []).map((r) => r.org_id as string | null).filter((v): v is string => !!v)),
    );
    const orgMap = new Map<string, { slug: string; name: string; tag: string | null }>();
    if (orgIds.length > 0) {
      const { data: orgs } = await admin.from("orgs").select("id, slug, name, tag").in("id", orgIds);
      for (const o of orgs ?? [])
        orgMap.set(o.id as string, {
          slug: o.slug as string,
          name: o.name as string,
          tag: (o.tag as string | null) ?? null,
        });
    }
    const ids = (rows ?? []).map((r) => r.id as string);
    const countMap = new Map<string, number>();
    const joined = new Set<string>();
    if (ids.length > 0) {
      const { data: parts } = await admin
        .from("mission_participants")
        .select("mission_id, user_id")
        .in("mission_id", ids);
      for (const p of parts ?? []) {
        const k = p.mission_id as string;
        countMap.set(k, (countMap.get(k) ?? 0) + 1);
        if (viewerId && p.user_id === viewerId) joined.add(k);
      }
    }
    return {
      viewer_signed_in: !!viewerId,
      missions: (rows ?? []).map((m) => ({
        id: m.id as string,
        slug: m.slug as string,
        title: m.title as string,
        description: (m.description as string | null) ?? "",
        starts_at: m.starts_at as string | null,
        status: m.status as string,
        category: m.category_id ? catMap.get(m.category_id as string) ?? null : null,
        org: m.org_id ? orgMap.get(m.org_id as string) ?? null : null,
        joined: joined.has(m.id as string),
        internal: !!(m as { is_internal?: boolean }).is_internal,
        participant_count: (m as { show_participant_count: boolean }).show_participant_count
          ? (countMap.get(m.id as string) ?? 0)
          : null,
      })),
    };
  });

// ---------- Signup / withdraw for public calendar events (any registered user) ----------
export const signupForPublicMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    const { data: mission } = await admin
      .from("missions")
      .select("id, password_hash, status, show_in_calendar, is_internal, org_id, is_hidden")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!mission) throw new Error("Einsatz nicht gefunden");
    if (mission.is_hidden) throw new Error("Dieser Einsatz ist noch nicht veröffentlicht");
    if (mission.password_hash || !mission.show_in_calendar)
      throw new Error("Dieser Einsatz ist nicht öffentlich");
    if (mission.is_internal) {
      const orgId = mission.org_id as string | null;
      const { data: mem } = orgId
        ? await admin
            .from("org_members")
            .select("id")
            .eq("org_id", orgId)
            .eq("user_id", context.userId)
            .maybeSingle()
        : { data: null };
      if (!mem) throw new Error("Dieser Einsatz ist nur für Orga-Mitglieder");
    }
    if (mission.status === "cancelled" || mission.status === "completed")
      throw new Error("Einschreibung nicht mehr möglich");

    const { data: existing } = await admin
      .from("mission_participants")
      .select("id")
      .eq("mission_id", mission.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { ok: true, already: true };

    const { data: profile } = await admin
      .from("profiles")
      .select("callsign, display_name")
      .eq("id", context.userId)
      .maybeSingle();
    const displayName =
      (profile?.callsign as string | null) ||
      (profile?.display_name as string | null) ||
      "Pilot";
    const { error: insErr } = await admin.from("mission_participants").insert({
      mission_id: mission.id,
      user_id: context.userId,
      display_name: displayName,
      token: randomToken(),
    });
    if (insErr) throw new Error(insErr.message);
    const { syncMissionAnnouncements } = await import("./discord-announce.server");
    await syncMissionAnnouncements(mission.id);
    return { ok: true, already: false };
  });

export const withdrawFromPublicMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    const { data: mission } = await admin
      .from("missions")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!mission) throw new Error("Einsatz nicht gefunden");
    const { error } = await admin
      .from("mission_participants")
      .delete()
      .eq("mission_id", mission.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const { syncMissionAnnouncements } = await import("./discord-announce.server");
    await syncMissionAnnouncements(mission.id);
    return { ok: true };
  });

// ---------- Create Mission (leader) ----------
export const createMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      title: z.string().min(1).max(120),
      description: z.string().max(2000).optional().default(""),
      password: z.string().max(100).optional().nullable(),
      starts_at: z.string().datetime().optional().nullable(),
      category_id: z.string().uuid().optional().nullable(),
      show_in_calendar: z.boolean().optional().default(true),
      show_participant_count: z.boolean().optional().default(true),
      is_internal: z.boolean().optional().default(false),
      is_hidden: z.boolean().optional().default(false),
      org_id: z.string().uuid().optional().nullable(),
      mode: z.enum(["instant", "planned"]).optional().default("planned"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    // Missions always belong to an org so they only show up on that org's page.
    let orgId = data.org_id ?? null;
    if (!orgId) {
      const { data: memberships } = await admin
        .from("org_members")
        .select("org_id")
        .eq("user_id", context.userId);
      if ((memberships ?? []).length === 1) orgId = memberships![0].org_id as string;
    }
    // unique slug
    let slug = randomSlug();
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await admin.from("missions").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = randomSlug();
    }
    // hash password via pgcrypto helper (public missions store NULL)
    const pwd = (data.password ?? "").trim();
    let password_hash: string | null = null;
    if (pwd.length > 0) {
      if (pwd.length < 3) throw new Error("Passwort muss mind. 3 Zeichen lang sein");
      const rpcResult = await admin.rpc("crypt_password" as never, { pwd } as never);
      const hashRows = rpcResult.data as Array<{ hash: string }> | null;
      if (rpcResult.error || !hashRows || hashRows.length === 0) {
        throw new Error(rpcResult.error?.message || "Passwort-Hashing fehlgeschlagen");
      }
      password_hash = hashRows[0].hash;
    }
    const instant = data.mode === "instant";
    const { data: mission, error } = await admin
      .from("missions")
      .insert({
        slug,
        title: data.title,
        description: data.description,
        password_hash,
        starts_at: instant ? null : (data.starts_at ?? null),
        category_id: data.category_id ?? null,
        show_in_calendar: instant || data.is_hidden ? false : data.show_in_calendar,
        show_participant_count: data.show_participant_count,
        is_internal: data.is_internal,
        is_hidden: data.is_hidden,
        leader_id: context.userId,
        org_id: orgId,
        status: instant ? "active" : "draft",
      })
      .select("id, slug, title")
      .single();
    if (error || !mission) throw new Error(error?.message || "Konnte Einsatz nicht anlegen");
    return mission;
  });

// ---------- Join Mission (public) ----------
export const joinMission = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      slug: z.string().min(1).max(40),
      password: z.string().max(100).optional().default(""),
      display_name: z.string().min(1).max(60),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getOptionalUserId } = await import("./optional-auth.server");
    const userId = await getOptionalUserId();
    const admin = getAdmin();
    const { data: mission, error } = await admin
      .from("missions")
      .select("id, password_hash, status, is_internal, org_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error || !mission) throw new Error("Einsatz nicht gefunden");
    if (mission.status === "cancelled") throw new Error("Einsatz wurde abgebrochen");
    // Interne Einsätze: kein Passwort, aber nur Orga-Mitglieder dürfen beitreten.
    if (mission.is_internal) {
      const orgId = mission.org_id as string | null;
      const { data: mem } = userId && orgId
        ? await admin
            .from("org_members")
            .select("id")
            .eq("org_id", orgId)
            .eq("user_id", userId)
            .maybeSingle()
        : { data: null };
      if (!mem) throw new Error("Dieser Einsatz ist nur für Orga-Mitglieder");
    }
    // public missions (no password_hash) allow anyone to join
    if (mission.password_hash) {
      if (!data.password) throw new Error("Passwort erforderlich");
      const { data: ok } = await admin.rpc("verify_mission_password" as never, {
        _mission_id: mission.id,
        _password: data.password,
      } as never);
      if (!ok) throw new Error("Falsches Passwort");
    }

    // upsert participant — identity comes from the verified bearer token only
    if (userId) {
      const { data: existing } = await admin
        .from("mission_participants")
        .select("id, token")
        .eq("mission_id", mission.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) {
        await admin
          .from("mission_participants")
          .update({ display_name: data.display_name })
          .eq("id", existing.id);
        return { mission_id: mission.id, participant_id: existing.id, token: existing.token };
      }
    }
    const token = randomToken();
    const { data: created, error: insErr } = await admin
      .from("mission_participants")
      .insert({
        mission_id: mission.id,
        user_id: userId,
        display_name: data.display_name,
        token,
      })
      .select("id, token")
      .single();
    if (insErr || !created) throw new Error(insErr?.message || "Beitritt fehlgeschlagen");
    const { syncMissionAnnouncements } = await import("./discord-announce.server");
    await syncMissionAnnouncements(mission.id);
    return { mission_id: mission.id, participant_id: created.id, token: created.token };
  });

// ---------- Get Mission (public, requires participant token OR leader auth) ----------
export const getMissionBySlug = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const admin = getAdmin();
    const { data: m, error } = await admin
      .from("missions")
      .select("id, slug, title, description, status, starts_at, created_at, leader_id, password_hash, show_in_calendar, show_participant_count, is_internal, profiles:leader_id(callsign, display_name)")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error || !m) throw new Error("Einsatz nicht gefunden");
    const { password_hash, ...rest } = m as { password_hash: string | null } & typeof m;
    return { ...rest, requires_password: !!password_hash };
  });

export const getMissionBoard = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ mission_id: z.string().uuid(), token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const [participants, ships] = await Promise.all([
      admin
        .from("mission_participants")
        .select("id, display_name, joined_at, user_id")
        .eq("mission_id", data.mission_id)
        .order("joined_at"),
      admin
        .from("mission_ships")
        .select("*")
        .eq("mission_id", data.mission_id)
        .order("created_at"),
    ]);
    const shipIds = (ships.data ?? []).map((s) => s.id as string);
    const [crew, stations] = await Promise.all([
      shipIds.length > 0
        ? admin
            .from("mission_ship_crew")
            .select("id, mission_ship_id, participant_id, seat_role, joined_at")
            .in("mission_ship_id", shipIds)
        : Promise.resolve({ data: [] as Array<{ id: string; mission_ship_id: string; participant_id: string; seat_role: string | null; joined_at: string }> }),
      shipIds.length > 0
        ? admin
            .from("mission_ship_stations")
            .select("id, mission_ship_id, slot_key, label, hardpoint_name, category, sort_order, is_manual, assigned_participant_id")
            .in("mission_ship_id", shipIds)
            .order("sort_order")
        : Promise.resolve({ data: [] as Array<{ id: string; mission_ship_id: string; slot_key: string; label: string; hardpoint_name: string | null; category: string; sort_order: number; is_manual: boolean; assigned_participant_id: string | null }> }),
    ]);
    const { data: boards } = shipIds.length > 0
      ? await admin
          .from("board_sessions")
          .select("id, code, mission_ship_id, status")
          .in("mission_ship_id", shipIds)
      : { data: [] as Array<{ id: string; code: string; mission_ship_id: string | null; status: string }> };
    return {
      participants: participants.data ?? [],
      ships: ships.data ?? [],
      crew: crew.data ?? [],
      stations: stations.data ?? [],
      boards: boards ?? [],
    };
  });

// ---------- Mutations (participant-gated) ----------
export const addMissionShip = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_slug: z.string().max(120).optional().nullable(),
      ship_name: z.string().min(1).max(120),
      manufacturer: z.string().max(120).optional().nullable(),
      role_tag: z.string().max(80).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { data: inserted, error } = await admin.from("mission_ships").insert({
      mission_id: data.mission_id,
      ship_slug: data.ship_slug ?? null,
      ship_name: data.ship_name,
      manufacturer: data.manufacturer ?? null,
      role_tag: data.role_tag ?? null,
      added_by: participantId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    // Seed loadout stations (mission leader's user template > admin template > Fleetyards)
    try {
      const { data: m } = await admin
        .from("missions")
        .select("leader_id")
        .eq("id", data.mission_id)
        .maybeSingle();
      const leaderId = (m?.leader_id as string | null) ?? "00000000-0000-0000-0000-000000000000";
      const { resolveSeedForCommander, randomCode, randomToken } = await import("./board.server");
      const { stations, meta } = await resolveSeedForCommander(leaderId, data.ship_slug ?? null);
      if (inserted?.id && stations.length > 0) {
        await admin.from("mission_ship_stations").insert(
          stations.map((s) => ({
            mission_ship_id: inserted.id,
            slot_key: s.slot_key,
            label: s.label,
            hardpoint_name: s.hardpoint_name,
            category: s.category,
            sort_order: s.sort_order,
            is_manual: false,
          })),
        );
      }
      // Auto-create a Boardcomputer session bound to this mission ship
      if (inserted?.id) {
        let code = randomCode();
        for (let i = 0; i < 5; i++) {
          const { data: exists } = await admin
            .from("board_sessions").select("id").eq("code", code).maybeSingle();
          if (!exists) break;
          code = randomCode();
        }
        const { data: session } = await admin
          .from("board_sessions")
          .insert({
            code,
            commander_id: leaderId,
            ship_slug: data.ship_slug ?? null,
            ship_name: data.ship_name,
            custom_name: data.role_tag ?? null,
            status: "standby",
            mission_id: data.mission_id,
            mission_ship_id: inserted.id,
            ship_meta: meta as unknown as never,
          })
          .select("id")
          .single();
        if (session?.id) {
          await admin.from("board_members").insert({
            session_id: session.id,
            user_id: leaderId,
            display_name: "Kommandant",
            token: randomToken(),
            is_commander: true,
          });
          if (stations.length > 0) {
            await admin.from("board_stations").insert(
              stations.map((s) => ({
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
          await admin
            .from("mission_ships")
            .update({ board_session_id: session.id })
            .eq("id", inserted.id);
        }
      }
      // Auto-seed voice channels: a group parent for this ship + "Brücke" sub-channel
      if (inserted?.id) {
        const { data: parent } = await admin
          .from("mission_voice_channels")
          .insert({
            mission_id: data.mission_id,
            name: data.ship_name,
            kind: "ship",
            ship_id: inserted.id,
            is_group_parent: true,
            allow_broadcast: true,
          })
          .select("id")
          .single();
        if (parent?.id) {
          await admin.from("mission_voice_channels").insert([
            {
              mission_id: data.mission_id,
              name: "Brücke",
              kind: "ship",
              ship_id: inserted.id,
              parent_id: parent.id,
              allow_broadcast: false,
            },
          ]);
        }
      }
    } catch { /* seeding is best-effort */ }
    return { ok: true };
  });

export const removeMissionShip = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // Cascade-clean voice channels created for this ship
    await admin.from("mission_voice_channels").delete().eq("ship_id", data.ship_id);
    // Cascade-clean the linked Boardcomputer session
    await admin.from("board_sessions").delete().eq("mission_ship_id", data.ship_id);
    const { error } = await admin
      .from("mission_ships")
      .delete()
      .eq("id", data.ship_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setShipStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_id: z.string().uuid(),
      status: z.enum(SHIP_STATUSES),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { error } = await admin
      .from("mission_ships")
      .update({ status: data.status })
      .eq("id", data.ship_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setShipRole = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_id: z.string().uuid(),
      role_tag: z.string().max(80),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { error } = await admin
      .from("mission_ships")
      .update({ role_tag: data.role_tag || null })
      .eq("id", data.ship_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const joinShipCrew = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_id: z.string().uuid(),
      seat_role: z.string().max(60).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // ensure ship belongs to this mission (prevents cross-mission crew injection)
    const { data: ship } = await admin
      .from("mission_ships")
      .select("id")
      .eq("id", data.ship_id)
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (!ship) throw new Error("Schiff nicht in diesem Einsatz");
    // remove existing crew assignment
    await admin.from("mission_ship_crew").delete().eq("participant_id", participantId);
    const { error } = await admin.from("mission_ship_crew").insert({
      mission_ship_id: data.ship_id,
      participant_id: participantId,
      seat_role: data.seat_role ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveShipCrew = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    await admin.from("mission_ship_crew").delete().eq("participant_id", participantId);
    return { ok: true };
  });

// Assign another participant to a ship (any mission participant may do this)
export const assignShipCrew = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_id: z.string().uuid(),
      target_participant_id: z.string().uuid(),
      seat_role: z.string().max(60).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // ensure target belongs to this mission
    const { data: target } = await admin
      .from("mission_participants")
      .select("id")
      .eq("id", data.target_participant_id)
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (!target) throw new Error("Mitspieler nicht in diesem Einsatz");
    // ensure ship belongs to this mission
    const { data: ship } = await admin
      .from("mission_ships")
      .select("id")
      .eq("id", data.ship_id)
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (!ship) throw new Error("Schiff nicht gefunden");
    // remove any existing assignment for that participant
    await admin.from("mission_ship_crew").delete().eq("participant_id", data.target_participant_id);
    const { error } = await admin.from("mission_ship_crew").insert({
      mission_ship_id: data.ship_id,
      participant_id: data.target_participant_id,
      seat_role: data.seat_role ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Remove a specific crew assignment (any mission participant may do this)
export const removeShipCrewMember = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      crew_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // Scope deletion strictly to ships belonging to the calling mission.
    const { data: shipRows } = await admin
      .from("mission_ships")
      .select("id")
      .eq("mission_id", data.mission_id);
    const shipIds = (shipRows ?? []).map((r) => r.id as string);
    if (shipIds.length === 0) return { ok: true };
    const { error } = await admin
      .from("mission_ship_crew")
      .delete()
      .eq("id", data.crew_id)
      .in("mission_ship_id", shipIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Leader-only ----------
export const updateMissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      status: z.enum(MISSION_STATUSES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    const { data: m } = await admin
      .from("missions")
      .select("leader_id")
      .eq("id", data.mission_id)
      .maybeSingle();
    if (!m) throw new Error("Einsatz nicht gefunden");
    if (!(await canManageMission(m.leader_id as string | null, context.userId))) {
      throw new Error("Keine Berechtigung, den Einsatzstatus zu ändern.");
    }
    const { error } = await admin
      .from("missions")
      .update({ status: data.status })
      .eq("id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ mission_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    // verify ownership
    const { data: m, error: mErr } = await admin
      .from("missions")
      .select("id, leader_id")
      .eq("id", data.mission_id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!m) throw new Error("Einsatz nicht gefunden");
    if (!(await canManageMission(m.leader_id as string | null, context.userId))) {
      throw new Error("Nur Einsatzleiter oder Einsatz-Admins dürfen den Einsatz löschen.");
    }
    // cascade: ship crew -> ships -> participants -> mission
    const { data: ships } = await admin
      .from("mission_ships")
      .select("id")
      .eq("mission_id", data.mission_id);
    const shipIds = (ships ?? []).map((s) => s.id);
    if (shipIds.length > 0) {
      await admin.from("mission_ship_crew").delete().in("mission_ship_id", shipIds);
      await admin.from("mission_ship_stations").delete().in("mission_ship_id", shipIds);
      await admin.from("board_sessions").delete().in("mission_ship_id", shipIds);
      await admin.from("mission_ships").delete().eq("mission_id", data.mission_id);
    }
    await admin.from("board_sessions").delete().eq("mission_id", data.mission_id);
    await admin.from("mission_voice_presence").delete().eq("mission_id", data.mission_id);
    await admin.from("mission_voice_channels").delete().eq("mission_id", data.mission_id);
    await admin.from("mission_participants").delete().eq("mission_id", data.mission_id);
    const { error } = await admin.from("missions").delete().eq("id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = getAdmin();
    const [led, joined] = await Promise.all([
      admin
        .from("missions")
        .select("id, slug, title, status, starts_at, created_at")
        .eq("leader_id", context.userId)
        .order("created_at", { ascending: false }),
      admin
        .from("mission_participants")
        .select("mission_id, joined_at, missions:mission_id(id, slug, title, status, starts_at, leader_id)")
        .eq("user_id", context.userId)
        .order("joined_at", { ascending: false }),
    ]);
    return { led: led.data ?? [], joined: joined.data ?? [] };
  });

// ---------- Get mission for edit (leader only) ----------
export const getMissionForEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    const { data: m, error } = await admin
      .from("missions")
      .select("id, slug, title, description, starts_at, category_id, show_in_calendar, show_participant_count, password_hash, leader_id, status, is_internal, is_hidden")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("Einsatz nicht gefunden");
    if (!(await canManageMission(m.leader_id as string | null, context.userId))) {
      throw new Error("Nur Einsatzleiter oder Einsatz-Admins dürfen bearbeiten.");
    }
    return {
      id: m.id as string,
      slug: m.slug as string,
      title: m.title as string,
      description: (m.description as string | null) ?? "",
      starts_at: m.starts_at as string | null,
      category_id: (m.category_id as string | null) ?? null,
      show_in_calendar: (m.show_in_calendar as boolean) ?? true,
      show_participant_count: (m.show_participant_count as boolean) ?? true,
      is_public: m.password_hash === null,
      is_internal: (m.is_internal as boolean) ?? false,
      is_hidden: (m.is_hidden as boolean) ?? false,
      status: m.status as string,
    };
  });

// ---------- Update mission (leader only) ----------
export const updateMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      title: z.string().min(1).max(120),
      description: z.string().max(2000).optional().default(""),
      // undefined = don't touch password; null = make public; string = set new password
      password: z.union([z.string().max(100), z.null()]).optional(),
      starts_at: z.string().datetime().optional().nullable(),
      category_id: z.string().uuid().optional().nullable(),
      show_in_calendar: z.boolean(),
      show_participant_count: z.boolean(),
      is_internal: z.boolean().optional(),
      is_hidden: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = getAdmin();
    const { data: m, error: mErr } = await admin
      .from("missions")
      .select("id, leader_id, password_hash")
      .eq("id", data.mission_id)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!m) throw new Error("Einsatz nicht gefunden");
    if (!(await canManageMission(m.leader_id as string | null, context.userId))) {
      throw new Error("Nur Einsatzleiter oder Einsatz-Admins dürfen bearbeiten.");
    }
    let password_hash_update: string | null | undefined = undefined;
    if (data.password !== undefined) {
      if (data.password === null || data.password.trim() === "") {
        password_hash_update = null;
      } else {
        const pwd = data.password.trim();
        if (pwd.length < 3) throw new Error("Passwort muss mind. 3 Zeichen lang sein");
        const rpcResult = await admin.rpc("crypt_password" as never, { pwd } as never);
        const hashRows = rpcResult.data as Array<{ hash: string }> | null;
        if (rpcResult.error || !hashRows || hashRows.length === 0) {
          throw new Error(rpcResult.error?.message || "Passwort-Hashing fehlgeschlagen");
        }
        password_hash_update = hashRows[0].hash;
      }
    }
    const { error } = await admin
      .from("missions")
      .update({
        title: data.title,
        description: data.description,
        starts_at: data.starts_at ?? null,
        category_id: data.category_id ?? null,
        show_in_calendar: data.is_hidden ? false : data.show_in_calendar,
        show_participant_count: data.show_participant_count,
        ...(data.is_internal !== undefined ? { is_internal: data.is_internal } : {}),
        ...(data.is_hidden !== undefined ? { is_hidden: data.is_hidden } : {}),
        ...(password_hash_update !== undefined ? { password_hash: password_hash_update } : {}),
      })
      .eq("id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Mission ship stations ----------
export const assignMissionStation = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      station_id: z.string().uuid(),
      participant_id: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // scope station to this mission
    const { data: st } = await admin
      .from("mission_ship_stations")
      .select("id, mission_ship_id, mission_ships:mission_ship_id(mission_id)")
      .eq("id", data.station_id)
      .maybeSingle();
    const stMissionId = (st as { mission_ships?: { mission_id?: string } | null } | null)?.mission_ships?.mission_id;
    if (!st || stMissionId !== data.mission_id) throw new Error("Station nicht gefunden");
    // Self-assign or reassign: unseat that participant elsewhere first
    if (data.participant_id) {
      await admin
        .from("mission_ship_stations")
        .update({ assigned_participant_id: null })
        .eq("assigned_participant_id", data.participant_id);
      // Ensure participant belongs to mission
      const { data: p } = await admin
        .from("mission_participants")
        .select("id")
        .eq("id", data.participant_id)
        .eq("mission_id", data.mission_id)
        .maybeSingle();
      if (!p) throw new Error("Teilnehmer nicht im Einsatz");
    }
    // Only self-assign, unassign self, or leader may assign others
    if (data.participant_id && data.participant_id !== participantId) {
      const { data: m } = await admin
        .from("missions")
        .select("leader_id, mission_participants:mission_participants(user_id)")
        .eq("id", data.mission_id)
        .maybeSingle();
      const leaderId = (m as { leader_id?: string | null } | null)?.leader_id ?? null;
      const { data: self } = await admin
        .from("mission_participants")
        .select("user_id")
        .eq("id", participantId)
        .maybeSingle();
      if (!self?.user_id) throw new Error("Nur der Leader darf andere zuweisen.");
      if (self.user_id !== leaderId) {
        const allowed = await userHasAnyOrgPerm(admin, self.user_id, "missions.manage");
        if (!allowed) throw new Error("Nur Einsatzleiter oder Einsatz-Admins dürfen andere zuweisen.");
      }
    }
    const { error } = await admin
      .from("mission_ship_stations")
      .update({ assigned_participant_id: data.participant_id })
      .eq("id", data.station_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addManualMissionStation = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      ship_id: z.string().uuid(),
      label: z.string().min(1).max(80),
      category: z.enum(["seat", "turret"]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // ship must belong to mission
    const { data: ship } = await admin
      .from("mission_ships").select("id").eq("id", data.ship_id).eq("mission_id", data.mission_id).maybeSingle();
    if (!ship) throw new Error("Schiff nicht gefunden");
    const { data: last } = await admin
      .from("mission_ship_stations")
      .select("sort_order")
      .eq("mission_ship_id", data.ship_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = ((last?.sort_order as number | undefined) ?? -1) + 1;
    const slot = `manual_${next}`;
    const { error } = await admin.from("mission_ship_stations").insert({
      mission_ship_id: data.ship_id,
      slot_key: slot,
      label: data.label,
      category: data.category,
      sort_order: next,
      is_manual: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMissionStation = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      station_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { data: st } = await admin
      .from("mission_ship_stations")
      .select("id, is_manual, mission_ships:mission_ship_id(mission_id)")
      .eq("id", data.station_id)
      .maybeSingle();
    const stMissionId = (st as { mission_ships?: { mission_id?: string } | null } | null)?.mission_ships?.mission_id;
    if (!st || stMissionId !== data.mission_id) throw new Error("Station nicht gefunden");
    if (!st.is_manual) throw new Error("Nur manuelle Stationen können entfernt werden.");
    const { error } = await admin.from("mission_ship_stations").delete().eq("id", data.station_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: list & delete missions ----------

export const adminListAllMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const admin = getAdmin();
    const { data, error } = await admin
      .from("missions")
      .select("id, slug, title, status, starts_at, created_at, leader_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const leaderIds = Array.from(new Set(rows.map((m) => m.leader_id).filter(Boolean))) as string[];
    let leaderMap = new Map<string, string>();
    if (leaderIds.length > 0) {
      const { data: profiles } = await admin.from("profiles").select("id, display_name, callsign").in("id", leaderIds);
      leaderMap = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name || p.callsign || "") as string]));
    }
    return rows.map((m) => ({ ...m, leader_name: m.leader_id ? leaderMap.get(m.leader_id) ?? null : null }));
  });

export const adminDeleteMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ mission_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const admin = getAdmin();
    const mid = data.mission_id;
    const { data: ships } = await admin.from("mission_ships").select("id").eq("mission_id", mid);
    const shipIds = (ships ?? []).map((s) => s.id);
    if (shipIds.length > 0) {
      await admin.from("mission_ship_crew").delete().in("mission_ship_id", shipIds);
      await admin.from("mission_ship_stations").delete().in("mission_ship_id", shipIds);
      await admin.from("mission_ships").delete().eq("mission_id", mid);
    }
    await admin.from("mission_voice_presence").delete().eq("mission_id", mid);
    await admin.from("mission_voice_channels").delete().eq("mission_id", mid);
    await admin.from("mission_participants").delete().eq("mission_id", mid);
    const { error } = await admin.from("missions").delete().eq("id", mid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
