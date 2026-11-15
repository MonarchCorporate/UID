import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyBoardMember } from "./board.server";

const CHANNEL_KINDS = ["command", "ship", "group"] as const;

function roomName(sessionId: string, channelId: string) {
  return `board-${sessionId}-${channelId}`;
}

function broadcastRoomName(sessionId: string, parentId: string) {
  return `board-${sessionId}-bcast-${parentId}`;
}

function scopeRoomName(sessionId: string, scope: "mission" | "squadleads") {
  return `board-${sessionId}-bcast-${scope}`;
}

const SCOPES = ["mission", "squadleads"] as const;

async function assertCommander(sessionId: string, memberId: string) {
  const [{ data: session }, { data: member }] = await Promise.all([
    supabaseAdmin.from("board_sessions").select("commander_id").eq("id", sessionId).maybeSingle(),
    supabaseAdmin.from("board_members").select("user_id, is_commander").eq("id", memberId).maybeSingle(),
  ]);
  if (!session) throw new Error("Session nicht gefunden");
  if (!member?.is_commander || member.user_id !== session.commander_id) {
    throw new Error("Nur der Kommandant darf Channels verwalten");
  }
}

export const listBoardVoiceChannels = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ session_id: z.string().uuid(), token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyBoardMember(data.session_id, data.token);
    const [channels, presence] = await Promise.all([
      supabaseAdmin
        .from("board_voice_channels")
        .select("id, name, kind, created_by, is_locked, created_at, parent_id, is_group_parent, allow_broadcast")
        .eq("session_id", data.session_id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("board_voice_presence")
        .select("id, channel_id, member_id, display_name, is_muted, is_deafened, joined_at, is_broadcasting, broadcast_scope")
        .eq("session_id", data.session_id),
    ]);
    const { data: members } = await supabaseAdmin
      .from("board_members")
      .select("id, is_squad_lead")
      .eq("session_id", data.session_id);
    const leadSet = new Set((members ?? []).filter((m) => m.is_squad_lead).map((m) => m.id as string));
    // Note: board voice has no per-ship binding; ship_id stays null for the UI.
    const chans = (channels.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      kind: c.kind as string,
      ship_id: null as string | null,
      created_by: (c.created_by as string | null) ?? null,
      is_locked: !!c.is_locked,
      created_at: c.created_at as string,
      parent_id: (c.parent_id as string | null) ?? null,
      is_group_parent: !!c.is_group_parent,
      allow_broadcast: c.allow_broadcast !== false,
    }));
    return {
      channels: chans,
      presence: (presence.data ?? []).map((p) => ({
        id: p.id as string,
        channel_id: p.channel_id as string,
        participant_id: p.member_id as string,
        display_name: p.display_name as string,
        is_muted: !!p.is_muted,
        is_deafened: !!p.is_deafened,
        joined_at: p.joined_at as string,
        is_broadcasting: !!p.is_broadcasting,
        broadcast_scope: (p.broadcast_scope as string | null) ?? null,
        is_squad_lead: leadSet.has(p.member_id as string),
      })),
      settings: { allow_mission_broadcast: true, allow_squadlead_broadcast: true },
    };
  });

export const createBoardVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      name: z.string().min(1).max(60),
      kind: z.enum(CHANNEL_KINDS).default("group"),
      parent_id: z.string().uuid().optional().nullable(),
      is_group_parent: z.boolean().optional().default(false),
      allow_broadcast: z.boolean().optional().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await assertCommander(data.session_id, m.id);
    const { data: row, error } = await supabaseAdmin
      .from("board_voice_channels")
      .insert({
        session_id: data.session_id,
        name: data.name,
        kind: data.kind,
        created_by: m.id,
        parent_id: data.parent_id ?? null,
        is_group_parent: data.is_group_parent ?? false,
        allow_broadcast: data.allow_broadcast ?? true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const updateBoardVoiceChannelSettings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
      allow_broadcast: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await assertCommander(data.session_id, m.id);
    const { error } = await supabaseAdmin
      .from("board_voice_channels")
      .update({ allow_broadcast: data.allow_broadcast })
      .eq("id", data.channel_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameBoardVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
      name: z.string().min(1).max(60),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await assertCommander(data.session_id, m.id);
    const { error } = await supabaseAdmin
      .from("board_voice_channels")
      .update({ name: data.name })
      .eq("id", data.channel_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBoardVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await assertCommander(data.session_id, m.id);
    const { error } = await supabaseAdmin
      .from("board_voice_channels")
      .delete()
      .eq("id", data.channel_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const joinBoardVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    const { data: channel } = await supabaseAdmin
      .from("board_voice_channels")
      .select("id, session_id, parent_id, is_group_parent")
      .eq("id", data.channel_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (!channel) throw new Error("Channel nicht gefunden");
    if (channel.is_group_parent) throw new Error("In eine Übergruppe kann man nicht direkt beitreten");

    await supabaseAdmin
      .from("board_voice_presence")
      .upsert(
        {
          channel_id: data.channel_id,
          session_id: data.session_id,
          member_id: m.id,
          display_name: m.display_name,
          is_muted: false,
          is_deafened: false,
          is_broadcasting: false,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "member_id" },
      );

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit ist nicht konfiguriert (LIVEKIT_URL / _API_KEY / _API_SECRET fehlen)");
    }
    const at = new AccessToken(apiKey, apiSecret, {
      identity: m.id,
      name: m.display_name,
      ttl: 60 * 60 * 2,
    });
    at.addGrant({
      roomJoin: true,
      room: roomName(data.session_id, data.channel_id),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await at.toJwt();

    let broadcast: { url: string; token: string; room: string; parent_id: string } | null = null;
    if (channel.parent_id) {
      const bcastRoom = broadcastRoomName(data.session_id, channel.parent_id as string);
      const bt = new AccessToken(apiKey, apiSecret, {
        identity: `${m.id}:listen`,
        name: m.display_name,
        ttl: 60 * 60 * 2,
      });
      bt.addGrant({
        roomJoin: true,
        room: bcastRoom,
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
      });
      broadcast = { url, token: await bt.toJwt(), room: bcastRoom, parent_id: channel.parent_id as string };
    }

    const missionRoom = scopeRoomName(data.session_id, "mission");
    const mt = new AccessToken(apiKey, apiSecret, {
      identity: `${m.id}:listen-mission`,
      name: m.display_name,
      ttl: 60 * 60 * 2,
    });
    mt.addGrant({ roomJoin: true, room: missionRoom, canPublish: false, canSubscribe: true });
    const listenMission = { url, token: await mt.toJwt(), room: missionRoom };

    const { data: memRow } = await supabaseAdmin
      .from("board_members")
      .select("is_squad_lead")
      .eq("id", m.id)
      .maybeSingle();
    let listenSquadleads: { url: string; token: string; room: string } | null = null;
    if (memRow?.is_squad_lead) {
      const sRoom = scopeRoomName(data.session_id, "squadleads");
      const st = new AccessToken(apiKey, apiSecret, {
        identity: `${m.id}:listen-sl`,
        name: m.display_name,
        ttl: 60 * 60 * 2,
      });
      st.addGrant({ roomJoin: true, room: sRoom, canPublish: false, canSubscribe: true });
      listenSquadleads = { url, token: await st.toJwt(), room: sRoom };
    }

    return {
      url,
      token: jwt,
      room: roomName(data.session_id, data.channel_id),
      broadcast,
      listen_mission: listenMission,
      listen_squadleads: listenSquadleads,
      is_squad_lead: !!memRow?.is_squad_lead,
    };
  });

export const joinBoardScopeBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      scope: z.enum(SCOPES),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    if (data.scope === "squadleads") {
      const { data: row } = await supabaseAdmin
        .from("board_members")
        .select("is_squad_lead")
        .eq("id", m.id)
        .maybeSingle();
      if (!row?.is_squad_lead) throw new Error("Nur Squadleads dürfen im Squadlead-Kanal senden");
    }
    await supabaseAdmin
      .from("board_voice_presence")
      .update({ broadcast_scope: data.scope })
      .eq("member_id", m.id)
      .eq("session_id", data.session_id);
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) throw new Error("LiveKit ist nicht konfiguriert");
    const room = scopeRoomName(data.session_id, data.scope);
    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${m.id}:bcast-${data.scope}`,
      name: m.display_name,
      ttl: 60 * 60 * 2,
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    return { url, token: await at.toJwt(), room };
  });

export const leaveBoardScopeBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ session_id: z.string().uuid(), token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await supabaseAdmin
      .from("board_voice_presence")
      .update({ broadcast_scope: null })
      .eq("member_id", m.id)
      .eq("session_id", data.session_id);
    return { ok: true };
  });

export const setBoardSquadLead = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      target_member_id: z.string().uuid(),
      on: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await assertCommander(data.session_id, m.id);
    const { error } = await supabaseAdmin
      .from("board_members")
      .update({ is_squad_lead: data.on })
      .eq("id", data.target_member_id)
      .eq("session_id", data.session_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBoardSquadleadListenToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    const { data: row } = await supabaseAdmin
      .from("board_members")
      .select("is_squad_lead")
      .eq("id", m.id)
      .maybeSingle();
    if (!row?.is_squad_lead) return null;
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) throw new Error("LiveKit ist nicht konfiguriert");
    const room = scopeRoomName(data.session_id, "squadleads");
    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${m.id}:listen-sl`,
      name: m.display_name,
      ttl: 60 * 60 * 2,
    });
    at.addGrant({ roomJoin: true, room, canPublish: false, canSubscribe: true });
    return { url, token: await at.toJwt(), room };
  });

export const joinBoardBroadcastRoom = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      parent_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    const { data: parent } = await supabaseAdmin
      .from("board_voice_channels")
      .select("id, is_group_parent, allow_broadcast")
      .eq("id", data.parent_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    if (!parent || !parent.is_group_parent) throw new Error("Übergruppe nicht gefunden");
    if (!parent.allow_broadcast) throw new Error("Broadcast ist für diese Übergruppe deaktiviert");

    await supabaseAdmin
      .from("board_voice_presence")
      .update({ is_broadcasting: true })
      .eq("member_id", m.id)
      .eq("session_id", data.session_id);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) throw new Error("LiveKit ist nicht konfiguriert");
    const bcastRoom = broadcastRoomName(data.session_id, data.parent_id);
    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${m.id}:bcast`,
      name: m.display_name,
      ttl: 60 * 60 * 2,
    });
    at.addGrant({
      roomJoin: true,
      room: bcastRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return { url, token: await at.toJwt(), room: bcastRoom };
  });

export const leaveBoardBroadcastRoom = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ session_id: z.string().uuid(), token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await supabaseAdmin
      .from("board_voice_presence")
      .update({ is_broadcasting: false })
      .eq("member_id", m.id)
      .eq("session_id", data.session_id);
    return { ok: true };
  });

export const leaveBoardVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ session_id: z.string().uuid(), token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    await supabaseAdmin
      .from("board_voice_presence")
      .delete()
      .eq("member_id", m.id)
      .eq("session_id", data.session_id);
    return { ok: true };
  });

export const updateBoardVoiceState = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      is_muted: z.boolean().optional(),
      is_deafened: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const m = await verifyBoardMember(data.session_id, data.token);
    const patch: { is_muted?: boolean; is_deafened?: boolean } = {};
    if (typeof data.is_muted === "boolean") patch.is_muted = data.is_muted;
    if (typeof data.is_deafened === "boolean") patch.is_deafened = data.is_deafened;
    if (Object.keys(patch).length === 0) return { ok: true };
    await supabaseAdmin
      .from("board_voice_presence")
      .update(patch)
      .eq("member_id", m.id)
      .eq("session_id", data.session_id);
    return { ok: true };
  });

export const setBoardMemberBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      session_id: z.string().uuid(),
      token: z.string().min(1),
      target_member_id: z.string().uuid(),
      on: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // Any authenticated board member may open/close ship-wide broadcast for
    // any other member of the same session.
    await verifyBoardMember(data.session_id, data.token);
    await supabaseAdmin
      .from("board_voice_presence")
      .update({ is_broadcasting: data.on })
      .eq("member_id", data.target_member_id)
      .eq("session_id", data.session_id);
    return { ok: true };
  });