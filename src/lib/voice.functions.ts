import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";

import { getAdmin, verifyParticipant } from "./missions.server";
import { userHasAnyOrgPerm } from "./org-perms.server";

const CHANNEL_KINDS = ["command", "ship", "group"] as const;

function roomName(missionId: string, channelId: string) {
  return `mission-${missionId}-${channelId}`;
}

function broadcastRoomName(missionId: string, parentId: string) {
  return `mission-${missionId}-bcast-${parentId}`;
}

function scopeRoomName(missionId: string, scope: "mission" | "squadleads") {
  return `mission-${missionId}-bcast-${scope}`;
}

const SCOPES = ["mission", "squadleads"] as const;
type ExtraScope = (typeof SCOPES)[number];

async function assertLeader(missionId: string, participantId: string) {
  const admin = getAdmin();
  const [{ data: mission }, { data: participant }] = await Promise.all([
    admin.from("missions").select("leader_id").eq("id", missionId).maybeSingle(),
    admin.from("mission_participants").select("user_id").eq("id", participantId).maybeSingle(),
  ]);
  if (!mission) throw new Error("Einsatz nicht gefunden");
  if (!participant?.user_id) throw new Error("Nur der Einsatzleiter darf Channels verwalten");
  if (participant.user_id === mission.leader_id) return;
  const allowed = await userHasAnyOrgPerm(admin, participant.user_id, "voice.manage");
  if (!allowed) throw new Error("Nur Einsatzleiter oder Voice-Admins dürfen Channels verwalten");
}

export const listVoiceChannels = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const [channels, presence] = await Promise.all([
      admin
        .from("mission_voice_channels")
        .select("id, name, kind, ship_id, created_by, is_locked, created_at, parent_id, is_group_parent, allow_broadcast")
        .eq("mission_id", data.mission_id)
        .order("created_at", { ascending: true }),
      admin
        .from("mission_voice_presence")
        .select("id, channel_id, participant_id, display_name, is_muted, is_deafened, joined_at, is_broadcasting, broadcast_scope")
        .eq("mission_id", data.mission_id),
    ]);
    const { data: parts } = await admin
      .from("mission_participants")
      .select("id, is_squad_lead")
      .eq("mission_id", data.mission_id);
    const leadSet = new Set((parts ?? []).filter((p) => p.is_squad_lead).map((p) => p.id as string));
    const { data: mission } = await admin
      .from("missions")
      .select("allow_mission_broadcast, allow_squadlead_broadcast")
      .eq("id", data.mission_id)
      .maybeSingle();
    return {
      channels: channels.data ?? [],
      presence: (presence.data ?? []).map((p) => ({
        ...p,
        is_squad_lead: leadSet.has(p.participant_id as string),
      })),
      settings: {
        allow_mission_broadcast: mission?.allow_mission_broadcast !== false,
        allow_squadlead_broadcast: mission?.allow_squadlead_broadcast !== false,
      },
    };
  });

export const createVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      name: z.string().min(1).max(60),
      kind: z.enum(CHANNEL_KINDS).default("group"),
      ship_id: z.string().uuid().optional().nullable(),
      parent_id: z.string().uuid().optional().nullable(),
      is_group_parent: z.boolean().optional().default(false),
      allow_broadcast: z.boolean().optional().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    await assertLeader(data.mission_id, participantId);
    const admin = getAdmin();
    const { data: row, error } = await admin
      .from("mission_voice_channels")
      .insert({
        mission_id: data.mission_id,
        name: data.name,
        kind: data.kind,
        ship_id: data.ship_id ?? null,
        created_by: participantId,
        parent_id: data.parent_id ?? null,
        is_group_parent: data.is_group_parent ?? false,
        allow_broadcast: data.allow_broadcast ?? true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const updateVoiceChannelSettings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
      allow_broadcast: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    await assertLeader(data.mission_id, participantId);
    const admin = getAdmin();
    const { error } = await admin
      .from("mission_voice_channels")
      .update({ allow_broadcast: data.allow_broadcast })
      .eq("id", data.channel_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
      name: z.string().min(1).max(60),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    await assertLeader(data.mission_id, participantId);
    const admin = getAdmin();
    const { error } = await admin
      .from("mission_voice_channels")
      .update({ name: data.name })
      .eq("id", data.channel_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    await assertLeader(data.mission_id, participantId);
    const admin = getAdmin();
    const { error } = await admin
      .from("mission_voice_channels")
      .delete()
      .eq("id", data.channel_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const joinVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      channel_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    // Ensure channel belongs to mission
    const { data: channel } = await admin
      .from("mission_voice_channels")
      .select("id, mission_id, parent_id, is_group_parent")
      .eq("id", data.channel_id)
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (!channel) throw new Error("Channel nicht gefunden");
    if (channel.is_group_parent) throw new Error("In eine Übergruppe kann man nicht direkt beitreten");
    // Lookup participant name
    const { data: participant } = await admin
      .from("mission_participants")
      .select("display_name")
      .eq("id", participantId)
      .maybeSingle();
    const displayName = participant?.display_name ?? "Anonym";

    // Upsert presence (unique on participant_id)
    await admin
      .from("mission_voice_presence")
      .upsert(
        {
          channel_id: data.channel_id,
          mission_id: data.mission_id,
          participant_id: participantId,
          display_name: displayName,
          is_muted: false,
          is_deafened: false,
          is_broadcasting: false,
          joined_at: new Date().toISOString(),
        },
        { onConflict: "participant_id" },
      );

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
      throw new Error("LiveKit ist nicht konfiguriert (LIVEKIT_URL / _API_KEY / _API_SECRET fehlen)");
    }
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantId,
      name: displayName,
      ttl: 60 * 60 * 2,
    });
    at.addGrant({
      roomJoin: true,
      room: roomName(data.mission_id, data.channel_id),
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const jwt = await at.toJwt();

    let broadcast: { url: string; token: string; room: string; parent_id: string } | null = null;
    if (channel.parent_id) {
      const bcastRoom = broadcastRoomName(data.mission_id, channel.parent_id as string);
      const bt = new AccessToken(apiKey, apiSecret, {
        identity: `${participantId}:listen`,
        name: displayName,
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

    // Mission-wide listener (everyone hears)
    const missionRoom = scopeRoomName(data.mission_id, "mission");
    const mt = new AccessToken(apiKey, apiSecret, {
      identity: `${participantId}:listen-mission`,
      name: displayName,
      ttl: 60 * 60 * 2,
    });
    mt.addGrant({ roomJoin: true, room: missionRoom, canPublish: false, canSubscribe: true });
    const listenMission = { url, token: await mt.toJwt(), room: missionRoom };

    // Squadlead listener (only if this participant is squad lead)
    const { data: partRow } = await admin
      .from("mission_participants")
      .select("is_squad_lead")
      .eq("id", participantId)
      .maybeSingle();
    let listenSquadleads: { url: string; token: string; room: string } | null = null;
    if (partRow?.is_squad_lead) {
      const sRoom = scopeRoomName(data.mission_id, "squadleads");
      const st = new AccessToken(apiKey, apiSecret, {
        identity: `${participantId}:listen-sl`,
        name: displayName,
        ttl: 60 * 60 * 2,
      });
      st.addGrant({ roomJoin: true, room: sRoom, canPublish: false, canSubscribe: true });
      listenSquadleads = { url, token: await st.toJwt(), room: sRoom };
    }

    return {
      url,
      token: jwt,
      room: roomName(data.mission_id, data.channel_id),
      broadcast,
      listen_mission: listenMission,
      listen_squadleads: listenSquadleads,
      is_squad_lead: !!partRow?.is_squad_lead,
    };
  });

export const joinScopeBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      scope: z.enum(SCOPES),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { data: mission } = await admin
      .from("missions")
      .select("allow_mission_broadcast, allow_squadlead_broadcast")
      .eq("id", data.mission_id)
      .maybeSingle();
    if (data.scope === "mission" && mission?.allow_mission_broadcast === false) {
      throw new Error("Einsatzweiter Broadcast ist deaktiviert");
    }
    if (data.scope === "squadleads") {
      if (mission?.allow_squadlead_broadcast === false) {
        throw new Error("Squadlead-Broadcast ist deaktiviert");
      }
      const { data: p } = await admin
        .from("mission_participants")
        .select("is_squad_lead")
        .eq("id", participantId)
        .maybeSingle();
      if (!p?.is_squad_lead) throw new Error("Nur Squadleads dürfen im Squadlead-Kanal senden");
    }
    const { data: part } = await admin
      .from("mission_participants")
      .select("display_name")
      .eq("id", participantId)
      .maybeSingle();
    const displayName = part?.display_name ?? "Anonym";
    await admin
      .from("mission_voice_presence")
      .update({ broadcast_scope: data.scope })
      .eq("participant_id", participantId)
      .eq("mission_id", data.mission_id);
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) throw new Error("LiveKit ist nicht konfiguriert");
    const room = scopeRoomName(data.mission_id, data.scope);
    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${participantId}:bcast-${data.scope}`,
      name: displayName,
      ttl: 60 * 60 * 2,
    });
    at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
    return { url, token: await at.toJwt(), room };
  });

export const leaveScopeBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    await admin
      .from("mission_voice_presence")
      .update({ broadcast_scope: null })
      .eq("participant_id", participantId)
      .eq("mission_id", data.mission_id);
    return { ok: true };
  });

export const setSquadLead = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      target_participant_id: z.string().uuid(),
      on: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    await assertLeader(data.mission_id, participantId);
    const admin = getAdmin();
    const { error } = await admin
      .from("mission_participants")
      .update({ is_squad_lead: data.on })
      .eq("id", data.target_participant_id)
      .eq("mission_id", data.mission_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSquadleadListenToken = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { data: partRow } = await admin
      .from("mission_participants")
      .select("is_squad_lead, display_name")
      .eq("id", participantId)
      .maybeSingle();
    if (!partRow?.is_squad_lead) return null;
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) throw new Error("LiveKit ist nicht konfiguriert");
    const room = scopeRoomName(data.mission_id, "squadleads");
    const st = new AccessToken(apiKey, apiSecret, {
      identity: `${participantId}:listen-sl`,
      name: partRow.display_name ?? "Anonym",
      ttl: 60 * 60 * 2,
    });
    st.addGrant({ roomJoin: true, room, canPublish: false, canSubscribe: true });
    return { url, token: await st.toJwt(), room };
  });

export const joinBroadcastRoom = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      parent_id: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const { data: parent } = await admin
      .from("mission_voice_channels")
      .select("id, is_group_parent, allow_broadcast, mission_id")
      .eq("id", data.parent_id)
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (!parent || !parent.is_group_parent) throw new Error("Übergruppe nicht gefunden");
    if (!parent.allow_broadcast) throw new Error("Broadcast ist für diese Übergruppe deaktiviert");

    const { data: participant } = await admin
      .from("mission_participants")
      .select("display_name")
      .eq("id", participantId)
      .maybeSingle();
    const displayName = participant?.display_name ?? "Anonym";

    await admin
      .from("mission_voice_presence")
      .update({ is_broadcasting: true })
      .eq("participant_id", participantId)
      .eq("mission_id", data.mission_id);

    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) throw new Error("LiveKit ist nicht konfiguriert");
    const bcastRoom = broadcastRoomName(data.mission_id, data.parent_id);
    const at = new AccessToken(apiKey, apiSecret, {
      identity: `${participantId}:bcast`,
      name: displayName,
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

export const leaveBroadcastRoom = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    await admin
      .from("mission_voice_presence")
      .update({ is_broadcasting: false })
      .eq("participant_id", participantId)
      .eq("mission_id", data.mission_id);
    return { ok: true };
  });

export const leaveVoiceChannel = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    await admin
      .from("mission_voice_presence")
      .delete()
      .eq("participant_id", participantId)
      .eq("mission_id", data.mission_id);
    return { ok: true };
  });

export const updateVoiceState = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      is_muted: z.boolean().optional(),
      is_deafened: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { participantId } = await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    const patch: { is_muted?: boolean; is_deafened?: boolean } = {};
    if (typeof data.is_muted === "boolean") patch.is_muted = data.is_muted;
    if (typeof data.is_deafened === "boolean") patch.is_deafened = data.is_deafened;
    if (Object.keys(patch).length === 0) return { ok: true };
    await admin
      .from("mission_voice_presence")
      .update(patch)
      .eq("participant_id", participantId)
      .eq("mission_id", data.mission_id);
    return { ok: true };
  });

export const setParticipantBroadcast = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      mission_id: z.string().uuid(),
      token: z.string().min(1),
      target_participant_id: z.string().uuid(),
      on: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    // Any authenticated participant of the mission may open/close ship-wide
    // broadcast for any other participant in the same mission.
    await verifyParticipant(data.mission_id, data.token);
    const admin = getAdmin();
    await admin
      .from("mission_voice_presence")
      .update({ is_broadcasting: data.on })
      .eq("participant_id", data.target_participant_id)
      .eq("mission_id", data.mission_id);
    return { ok: true };
  });