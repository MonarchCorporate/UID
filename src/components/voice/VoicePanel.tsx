import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Room, RoomEvent, Track } from "livekit-client";
import type { LocalAudioTrack, Participant, RemoteParticipant } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { Mic, MicOff, Headphones, HeadphoneOff, LogOut, Plus, Radio, Trash2, Pencil, Megaphone, Rocket, Users, ChevronDown, Signal, Settings2, KeyRound, Star } from "lucide-react";

export type ShipRef = { id: string; ship_name: string };

export type VoiceChannelRow = {
  id: string;
  name: string;
  kind: string;
  ship_id: string | null;
  created_by: string | null;
  is_locked: boolean;
  created_at: string;
  parent_id?: string | null;
  is_group_parent?: boolean;
  allow_broadcast?: boolean;
};

export type VoicePresenceRow = {
  id: string;
  channel_id: string;
  participant_id: string;
  display_name: string;
  is_muted: boolean;
  is_deafened: boolean;
  joined_at: string;
  is_broadcasting?: boolean;
  broadcast_scope?: string | null;
  is_squad_lead?: boolean;
};

export type VoiceAdapter = {
  scopeKey: string;
  realtime: { table: string; filter: string }[];
  list: () => Promise<{ channels: VoiceChannelRow[]; presence: VoicePresenceRow[] }>;
  create: (i: {
    name: string;
    kind: "command" | "ship" | "group";
    ship_id?: string | null;
    parent_id?: string | null;
    is_group_parent?: boolean;
    allow_broadcast?: boolean;
  }) => Promise<{ id: string }>;
  rename: (i: { channel_id: string; name: string }) => Promise<unknown>;
  remove: (i: { channel_id: string }) => Promise<unknown>;
  join: (i: { channel_id: string }) => Promise<{
    url: string;
    token: string;
    broadcast?: { url: string; token: string; room: string; parent_id: string } | null;
    listen_mission?: { url: string; token: string; room: string } | null;
    listen_squadleads?: { url: string; token: string; room: string } | null;
    is_squad_lead?: boolean;
  }>;
  leave: () => Promise<unknown>;
  updateState: (i: { is_muted?: boolean; is_deafened?: boolean }) => Promise<unknown>;
  joinBroadcast?: (i: { parent_id: string }) => Promise<{ url: string; token: string; room: string }>;
  leaveBroadcast?: () => Promise<unknown>;
  updateSettings?: (i: { channel_id: string; allow_broadcast: boolean }) => Promise<unknown>;
  setRemoteBroadcast?: (i: { target_participant_id: string; on: boolean }) => Promise<unknown>;
  joinScopeBroadcast?: (i: { scope: "mission" | "squadleads" }) => Promise<{ url: string; token: string; room: string }>;
  leaveScopeBroadcast?: () => Promise<unknown>;
  setSquadLead?: (i: { target_participant_id: string; on: boolean }) => Promise<unknown>;
  getSquadleadListen?: () => Promise<{ url: string; token: string; room: string } | null>;
};

type Props = {
  adapter: VoiceAdapter;
  selfId: string;
  canManage: boolean;
  ships?: ShipRef[];
};

const PTT_KEY = " "; // Space

type VoiceMode = "ptt" | "vox";
const VOICE_SETTINGS_KEY = "voice-settings";
const VAD_MIN_THRESHOLD_DB = -70;
const VAD_DISPLAY_MIN_DB = -90;
const VAD_OFF_THRESHOLD_DB = 0;
const VAD_THRESHOLD_GAP_DB = 10;
const VAD_MIN_GATE_GAP_DB = 3;
const VAD_ATTACK_MS = 120;
const VAD_SILENCE_DB = -100;
const DEFAULT_START_THRESHOLD_DB = -40;
const DEFAULT_STOP_THRESHOLD_DB = -50;
const DEFAULT_GAIN_DB = 0;
const DEFAULT_NOISE_FLOOR_DB = -68;
const DEFAULT_HANGOVER_MS = 250;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type VoiceSettings = {
  mode: VoiceMode;
  startThresholdDb: number;
  stopThresholdDb: number;
  gainDb: number;
  noiseFloorDb: number;
  hangoverMs: number;
};

function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") {
    return {
      mode: "ptt",
      startThresholdDb: DEFAULT_START_THRESHOLD_DB,
      stopThresholdDb: DEFAULT_STOP_THRESHOLD_DB,
      gainDb: DEFAULT_GAIN_DB,
      noiseFloorDb: DEFAULT_NOISE_FLOOR_DB,
      hangoverMs: DEFAULT_HANGOVER_MS,
    };
  }
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) {
      return {
        mode: "ptt",
        startThresholdDb: DEFAULT_START_THRESHOLD_DB,
        stopThresholdDb: DEFAULT_STOP_THRESHOLD_DB,
        gainDb: DEFAULT_GAIN_DB,
        noiseFloorDb: DEFAULT_NOISE_FLOOR_DB,
        hangoverMs: DEFAULT_HANGOVER_MS,
      };
    }
    const p = JSON.parse(raw) as Partial<VoiceSettings & { thresholdDb: number }>;
    // Migration: old single threshold -> use as both start and stop thresholds
    const migratedStart = typeof p.thresholdDb === "number" ? p.thresholdDb : DEFAULT_START_THRESHOLD_DB;
    const start = clamp(
      typeof p.startThresholdDb === "number" ? p.startThresholdDb : migratedStart,
      VAD_MIN_THRESHOLD_DB,
      VAD_OFF_THRESHOLD_DB,
    );
    return {
      mode: p.mode === "vox" ? "vox" : "ptt",
      startThresholdDb: start,
      stopThresholdDb: clamp(
        typeof p.stopThresholdDb === "number" ? p.stopThresholdDb : migratedStart - 10,
        VAD_DISPLAY_MIN_DB,
        Math.min(start - VAD_MIN_GATE_GAP_DB, VAD_OFF_THRESHOLD_DB - VAD_MIN_GATE_GAP_DB),
      ),
      gainDb: clamp(typeof p.gainDb === "number" ? p.gainDb : DEFAULT_GAIN_DB, -10, 30),
      noiseFloorDb: clamp(typeof p.noiseFloorDb === "number" ? p.noiseFloorDb : DEFAULT_NOISE_FLOOR_DB, VAD_DISPLAY_MIN_DB, -20),
      hangoverMs: clamp(typeof p.hangoverMs === "number" ? p.hangoverMs : DEFAULT_HANGOVER_MS, 50, 1000),
    };
  } catch {
    return {
      mode: "ptt",
      startThresholdDb: DEFAULT_START_THRESHOLD_DB,
      stopThresholdDb: DEFAULT_STOP_THRESHOLD_DB,
      gainDb: DEFAULT_GAIN_DB,
      noiseFloorDb: DEFAULT_NOISE_FLOOR_DB,
      hangoverMs: DEFAULT_HANGOVER_MS,
    };
  }
}

export function VoicePanel({ adapter, selfId, canManage, ships = [] }: Props) {
  const qc = useQueryClient();

  const queryKey = ["voice-channels", adapter.scopeKey];
  const q = useQuery({
    queryKey,
    queryFn: () => adapter.list(),
    refetchOnWindowFocus: false,
  });

  // Realtime updates
  useEffect(() => {
    const ch = supabase.channel(`voice:${adapter.scopeKey}`);
    for (const t of adapter.realtime) {
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t.table, filter: t.filter },
        () => qc.invalidateQueries({ queryKey }),
      );
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter.scopeKey]);

  const channels = q.data?.channels ?? [];
  const presence = q.data?.presence ?? [];

  const grouped = useMemo(() => {
    return {
      command: channels.filter((c) => c.kind === "command" && !c.parent_id && !c.is_group_parent),
      ship: channels.filter((c) => c.kind === "ship" && !c.parent_id && !c.is_group_parent),
      group: channels.filter((c) => c.kind === "group" && !c.parent_id && !c.is_group_parent),
    };
  }, [channels]);

  const parents = useMemo(() => channels.filter((c) => c.is_group_parent), [channels]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, VoiceChannelRow[]>();
    for (const c of channels) {
      if (c.parent_id) {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    return map;
  }, [channels]);

  const myPresence = presence.find((p) => p.participant_id === selfId);
  const activeChannelId = myPresence?.channel_id ?? null;

  // LiveKit connection state
  const [connection, setConnection] = useState<{ channelId: string; room: Room } | null>(null);
  // Passive listener for the parent group broadcast room while joined in a subchannel.
  const [listenRoom, setListenRoom] = useState<{ parentId: string; room: Room } | null>(null);
  // Reusable broadcast join info from the last subchannel join (url/token/room/parentId).
  const broadcastInfoRef = useRef<{ url: string; token: string; room: string; parent_id: string } | null>(null);
  // Active broadcast publish room when the user is currently talking ship-wide.
  const [broadcasting, setBroadcasting] = useState<{ parentId: string; room: Room } | null>(null);
  // Passive listeners + optional publish for mission-wide and squadleads scopes.
  const [listenMissionRoom, setListenMissionRoom] = useState<Room | null>(null);
  const [listenSquadleadsRoom, setListenSquadleadsRoom] = useState<Room | null>(null);
  const listenMissionInfoRef = useRef<{ url: string; token: string; room: string } | null>(null);
  const listenSquadleadsInfoRef = useRef<{ url: string; token: string; room: string } | null>(null);
  const isSquadLead = !!myPresence?.is_squad_lead;
  // Only one broadcast scope can be active at a time.
  const [scopeBroadcast, setScopeBroadcast] = useState<{ scope: "mission" | "squadleads"; room: Room } | null>(null);
  const [scopeBroadcastBusy, setScopeBroadcastBusy] = useState(false);

  const activeChannel = channels.find((c) => c.id === (connection?.channelId ?? ""));
  const activeParent = activeChannel?.parent_id ? channels.find((c) => c.id === activeChannel.parent_id) : null;
  const canBroadcast = !!(activeParent && activeParent.allow_broadcast !== false && adapter.joinBroadcast);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const [micOn, setMicOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [micTrack, setMicTrack] = useState<LocalAudioTrack | null>(null);
  const [mode, setMode] = useState<VoiceMode>(() => loadVoiceSettings().mode);
  const [startThresholdDb, setStartThresholdDb] = useState<number>(() => loadVoiceSettings().startThresholdDb);
  const [stopThresholdDb, setStopThresholdDb] = useState<number>(() => loadVoiceSettings().stopThresholdDb);
  const [gainDb, setGainDb] = useState<number>(() => loadVoiceSettings().gainDb);
  const [noiseFloorDb, setNoiseFloorDb] = useState<number>(() => loadVoiceSettings().noiseFloorDb);
  const [hangoverMs, setHangoverMs] = useState<number>(() => loadVoiceSettings().hangoverMs);
  const [forcedMute, setForcedMute] = useState(false);
  const [rawLevelDb, setRawLevelDb] = useState(VAD_SILENCE_DB);
  const [levelDb, setLevelDb] = useState(VAD_SILENCE_DB);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const micTrackRef = useRef<LocalAudioTrack | null>(null);
  // Whichever LiveKit room currently owns the mic publication (subchannel by default,
  // parent broadcast room when the user is broadcasting ship-wide).
  const publishRoomRef = useRef<Room | null>(null);
  const lastVoxTrackRef = useRef<LocalAudioTrack | null>(null);
  const forcedMuteRef = useRef(false);
  const voxTargetSendingRef = useRef(false);
  const vadSettingsVersionRef = useRef(0);
  const vadSettingsRef = useRef({ startThresholdDb, stopThresholdDb, gainDb, noiseFloorDb, hangoverMs });
  const vadGateRef = useRef({ speaking: false, aboveSince: 0, lastVoiceAt: 0, settingsVersion: 0 });

  useEffect(() => { micTrackRef.current = micTrack; }, [micTrack]);
  useEffect(() => { forcedMuteRef.current = forcedMute; }, [forcedMute]);
  useEffect(() => {
    vadSettingsRef.current = { startThresholdDb, stopThresholdDb, gainDb, noiseFloorDb, hangoverMs };
    vadSettingsVersionRef.current += 1;
  }, [startThresholdDb, stopThresholdDb, gainDb, noiseFloorDb, hangoverMs]);

  const applyVoxGate = useCallback((shouldSend: boolean) => {
    const track = micTrackRef.current;
    const sameTrack = lastVoxTrackRef.current === track;
    if (voxTargetSendingRef.current === shouldSend && sameTrack) return;
    voxTargetSendingRef.current = shouldSend;
    setMicOn(shouldSend);
    if (!track) return;
    lastVoxTrackRef.current = track;

    const action = shouldSend ? track.unmute() : track.mute();
    Promise.resolve(action)
      .then(() => {
        const current = micTrackRef.current;
        if (!current || voxTargetSendingRef.current === shouldSend) return;
        if (voxTargetSendingRef.current) void current.unmute();
        else void current.mute();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const closeVoxGate = useCallback(() => {
    vadGateRef.current = { speaking: false, aboveSince: 0, lastVoiceAt: 0, settingsVersion: vadSettingsVersionRef.current };
    setIsSpeaking(false);
    applyVoxGate(false);
  }, [applyVoxGate]);

  // Persist settings
  useEffect(() => {
    try {
      window.localStorage.setItem(
        VOICE_SETTINGS_KEY,
        JSON.stringify({ mode, startThresholdDb, stopThresholdDb, gainDb, noiseFloorDb, hangoverMs }),
      );
    } catch { /* noop */ }
  }, [mode, startThresholdDb, stopThresholdDb, gainDb, noiseFloorDb, hangoverMs]);

  function setVoxSensitivity(nextValue: number) {
    const nextStart = clamp(nextValue, VAD_MIN_THRESHOLD_DB, VAD_OFF_THRESHOLD_DB);
    setStartThresholdDb(nextStart);
    setStopThresholdDb((current) => clamp(
      Math.min(current, nextStart - VAD_MIN_GATE_GAP_DB),
      VAD_DISPLAY_MIN_DB,
      VAD_OFF_THRESHOLD_DB - VAD_MIN_GATE_GAP_DB,
    ));
    if (nextStart >= VAD_OFF_THRESHOLD_DB) {
      closeVoxGate();
    }
  }

  function setVoxStopThreshold(nextValue: number) {
    const maxStop = Math.min(startThresholdDb - VAD_MIN_GATE_GAP_DB, VAD_OFF_THRESHOLD_DB - VAD_MIN_GATE_GAP_DB);
    setStopThresholdDb(clamp(nextValue, VAD_DISPLAY_MIN_DB, maxStop));
  }

  const createMut = useMutation({
    mutationFn: (input: {
      name: string;
      kind: "command" | "ship" | "group";
      ship_id?: string | null;
      parent_id?: string | null;
      is_group_parent?: boolean;
      allow_broadcast?: boolean;
    }) => adapter.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  async function connect(channelId: string) {
    if (connection?.channelId === channelId) return;
    setError(null);
    setConnecting(channelId);
    try {
      // Tear down existing subchannel + listener + broadcast before switching.
      if (broadcasting) {
        try { await broadcasting.room.disconnect(); } catch { /* noop */ }
        setBroadcasting(null);
        try { await adapter.leaveBroadcast?.(); } catch { /* noop */ }
      }
      if (listenRoom) {
        try { await listenRoom.room.disconnect(); } catch { /* noop */ }
        setListenRoom(null);
      }
      broadcastInfoRef.current = null;
      if (connection) {
        await connection.room.disconnect();
        setConnection(null);
      }
      const res = await adapter.join({ channel_id: channelId });
      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setSpeakingIds(new Set(speakers.map((s) => s.identity)));
      });
      room.on(RoomEvent.Disconnected, () => {
        setConnection(null);
        closeVoxGate();
        setSpeakingIds(new Set());
        setMicTrack(null);
        publishRoomRef.current = null;
      });
      await room.connect(res.url, res.token);
      setConnection({ channelId, room });
      publishRoomRef.current = room;
      setMicOn(false);
      setDeafened(false);
      setForcedMute(false);

      // Attach passive listener for parent broadcast when the channel has a parent.
      if (res.broadcast) {
        broadcastInfoRef.current = res.broadcast;
        const listen = new Room({ adaptiveStream: true, dynacast: true });
        try {
          await listen.connect(res.broadcast.url, res.broadcast.token);
          setListenRoom({ parentId: res.broadcast.parent_id, room: listen });
        } catch (e) {
          try { await listen.disconnect(); } catch { /* noop */ }
          console.warn("broadcast listen connect failed", e);
        }
      }
      // Mission-wide passive listener (always).
      if (res.listen_mission) {
        listenMissionInfoRef.current = res.listen_mission;
        const lm = new Room({ adaptiveStream: true, dynacast: true });
        try {
          await lm.connect(res.listen_mission.url, res.listen_mission.token);
          setListenMissionRoom(lm);
        } catch (e) {
          try { await lm.disconnect(); } catch { /* noop */ }
          console.warn("mission listen connect failed", e);
        }
      }
      // Squadleads passive listener (only when this user is a squad lead).
      if (res.listen_squadleads) {
        listenSquadleadsInfoRef.current = res.listen_squadleads;
        const ls = new Room({ adaptiveStream: true, dynacast: true });
        try {
          await ls.connect(res.listen_squadleads.url, res.listen_squadleads.token);
          setListenSquadleadsRoom(ls);
        } catch (e) {
          try { await ls.disconnect(); } catch { /* noop */ }
          console.warn("squadleads listen connect failed", e);
        }
      }
      qc.invalidateQueries({ queryKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(null);
    }
  }

  async function disconnect() {
    if (broadcasting) {
      try { await broadcasting.room.disconnect(); } catch { /* noop */ }
      setBroadcasting(null);
      try { await adapter.leaveBroadcast?.(); } catch { /* noop */ }
    }
    if (scopeBroadcast) {
      try { await scopeBroadcast.room.disconnect(); } catch { /* noop */ }
      setScopeBroadcast(null);
      try { await adapter.leaveScopeBroadcast?.(); } catch { /* noop */ }
    }
    if (listenRoom) {
      try { await listenRoom.room.disconnect(); } catch { /* noop */ }
      setListenRoom(null);
    }
    if (listenMissionRoom) {
      try { await listenMissionRoom.disconnect(); } catch { /* noop */ }
      setListenMissionRoom(null);
    }
    if (listenSquadleadsRoom) {
      try { await listenSquadleadsRoom.disconnect(); } catch { /* noop */ }
      setListenSquadleadsRoom(null);
    }
    broadcastInfoRef.current = null;
    listenMissionInfoRef.current = null;
    listenSquadleadsInfoRef.current = null;
    if (connection) await connection.room.disconnect();
    setConnection(null);
    closeVoxGate();
    setRawLevelDb(VAD_SILENCE_DB);
    setLevelDb(VAD_SILENCE_DB);
    setMicTrack(null);
    publishRoomRef.current = null;
    try {
      await adapter.leave();
    } catch { /* noop */ }
    qc.invalidateQueries({ queryKey });
  }

  // Enable/disable the underlying microphone publication.
  // In PTT mode we release the mic when not held.
  // In VOX mode we keep the mic captured but toggle track.mute()/unmute() for gating.
  async function ensureMicEnabled(enabled: boolean) {
    if (!connection) return;
    const room = publishRoomRef.current ?? connection.room;
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track = (pub?.track as LocalAudioTrack | undefined) ?? null;
      setMicTrack(track);
      if (!enabled) {
        setMicOn(false);
        adapter.updateState({ is_muted: true }).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function startBroadcast() {
    if (!connection || broadcasting || broadcastBusy) return;
    if (!adapter.joinBroadcast) return;
    const info = broadcastInfoRef.current;
    if (!info) return;
    setBroadcastBusy(true);
    setError(null);
    try {
      // Release mic on subchannel first.
      try { await connection.room.localParticipant.setMicrophoneEnabled(false); } catch { /* noop */ }
      setMicTrack(null);
      publishRoomRef.current = null;
      // Disconnect passive listener so we don't hear ourselves back.
      if (listenRoom) {
        try { await listenRoom.room.disconnect(); } catch { /* noop */ }
        setListenRoom(null);
      }
      const grant = await adapter.joinBroadcast({ parent_id: info.parent_id });
      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setSpeakingIds(new Set(speakers.map((s) => s.identity)));
      });
      await room.connect(grant.url, grant.token);
      publishRoomRef.current = room;
      setBroadcasting({ parentId: info.parent_id, room });
      // Fresh state; VOX/PTT effect wires up mic on the new publish room.
      closeVoxGate();
      if (mode === "vox") {
        try { await room.localParticipant.setMicrophoneEnabled(true); } catch { /* noop */ }
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = (pub?.track as LocalAudioTrack | undefined) ?? null;
        if (track) { track.mute(); setMicTrack(track); }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBroadcastBusy(false);
    }
  }

  async function stopBroadcast() {
    if (broadcastBusy) return;
    setBroadcastBusy(true);
    try {
      if (broadcasting) {
        try { await broadcasting.room.disconnect(); } catch { /* noop */ }
        setBroadcasting(null);
      }
      try { await adapter.leaveBroadcast?.(); } catch { /* noop */ }
      publishRoomRef.current = connection?.room ?? null;
      setMicTrack(null);
      closeVoxGate();
      // Restart the passive listener for the parent.
      const info = broadcastInfoRef.current;
      if (info) {
        const listen = new Room({ adaptiveStream: true, dynacast: true });
        try {
          await listen.connect(info.url, info.token);
          setListenRoom({ parentId: info.parent_id, room: listen });
        } catch { /* noop */ }
      }
      // Re-enable mic on subchannel if VOX.
      if (connection && mode === "vox") {
        try { await connection.room.localParticipant.setMicrophoneEnabled(true); } catch { /* noop */ }
        const pub = connection.room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = (pub?.track as LocalAudioTrack | undefined) ?? null;
        if (track) { track.mute(); setMicTrack(track); }
      }
    } finally {
      setBroadcastBusy(false);
    }
  }

  async function startScopeBroadcast(scope: "mission" | "squadleads") {
    if (!connection || scopeBroadcast || scopeBroadcastBusy || broadcasting) return;
    if (!adapter.joinScopeBroadcast) return;
    setScopeBroadcastBusy(true);
    setError(null);
    try {
      // Release mic from subchannel first.
      try { await connection.room.localParticipant.setMicrophoneEnabled(false); } catch { /* noop */ }
      setMicTrack(null);
      publishRoomRef.current = null;
      // Disconnect the matching passive listener to avoid hearing ourselves.
      if (scope === "mission" && listenMissionRoom) {
        try { await listenMissionRoom.disconnect(); } catch { /* noop */ }
        setListenMissionRoom(null);
      }
      if (scope === "squadleads" && listenSquadleadsRoom) {
        try { await listenSquadleadsRoom.disconnect(); } catch { /* noop */ }
        setListenSquadleadsRoom(null);
      }
      const grant = await adapter.joinScopeBroadcast({ scope });
      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setSpeakingIds(new Set(speakers.map((s) => s.identity)));
      });
      await room.connect(grant.url, grant.token);
      publishRoomRef.current = room;
      setScopeBroadcast({ scope, room });
      closeVoxGate();
      if (mode === "vox") {
        try { await room.localParticipant.setMicrophoneEnabled(true); } catch { /* noop */ }
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = (pub?.track as LocalAudioTrack | undefined) ?? null;
        if (track) { track.mute(); setMicTrack(track); }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScopeBroadcastBusy(false);
    }
  }

  async function stopScopeBroadcast() {
    if (scopeBroadcastBusy) return;
    setScopeBroadcastBusy(true);
    try {
      const scope = scopeBroadcast?.scope ?? null;
      if (scopeBroadcast) {
        try { await scopeBroadcast.room.disconnect(); } catch { /* noop */ }
        setScopeBroadcast(null);
      }
      try { await adapter.leaveScopeBroadcast?.(); } catch { /* noop */ }
      publishRoomRef.current = connection?.room ?? null;
      setMicTrack(null);
      closeVoxGate();
      // Restart the matching passive listener.
      if (scope === "mission" && listenMissionInfoRef.current) {
        const info = listenMissionInfoRef.current;
        const lm = new Room({ adaptiveStream: true, dynacast: true });
        try { await lm.connect(info.url, info.token); setListenMissionRoom(lm); } catch { /* noop */ }
      }
      if (scope === "squadleads" && listenSquadleadsInfoRef.current) {
        const info = listenSquadleadsInfoRef.current;
        const ls = new Room({ adaptiveStream: true, dynacast: true });
        try { await ls.connect(info.url, info.token); setListenSquadleadsRoom(ls); } catch { /* noop */ }
      }
      if (connection && mode === "vox") {
        try { await connection.room.localParticipant.setMicrophoneEnabled(true); } catch { /* noop */ }
        const pub = connection.room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = (pub?.track as LocalAudioTrack | undefined) ?? null;
        if (track) { track.mute(); setMicTrack(track); }
      }
    } finally {
      setScopeBroadcastBusy(false);
    }
  }

  // PTT sending gate: while Space held & not force-muted, publish live.
  async function setPttSending(sending: boolean) {
    if (mode !== "ptt") return;
    const shouldSend = sending && !forcedMute;
    await ensureMicEnabled(shouldSend);
    if (shouldSend) {
      setMicOn(true);
      adapter.updateState({ is_muted: false }).catch(() => {});
    }
  }

  // Remote-controlled broadcast sync: any other participant can flip
  // is_broadcasting on this user's presence row to hand them the ship-wide
  // channel. Mirror that flag onto the local LiveKit connection.
  const remoteBcAppliedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!connection) return;
    const wanted = !!myPresence?.is_broadcasting;
    const have = !!broadcasting;
    if (wanted === have) { remoteBcAppliedRef.current = wanted; return; }
    if (broadcastBusy) return;
    // Only act on flag transitions we haven't consumed yet.
    if (remoteBcAppliedRef.current === wanted) return;
    remoteBcAppliedRef.current = wanted;
    if (wanted) {
      if (!broadcastInfoRef.current || !adapter.joinBroadcast) return;
      void startBroadcast();
    } else {
      void stopBroadcast();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPresence?.is_broadcasting, connection, broadcasting, broadcastBusy]);

  // Reactive squadlead listener: when the current user gets marked as squad
  // lead (or unmarked) mid-session, attach/detach the passive listener room
  // so the "LEAD" mark alone controls whether they HEAR squadlead-funk. It
  // never publishes — only the Squadlead-Funk button does that.
  const squadListenBusyRef = useRef(false);
  useEffect(() => {
    if (!connection) return;
    if (squadListenBusyRef.current) return;
    if (isSquadLead && !listenSquadleadsRoom) {
      squadListenBusyRef.current = true;
      (async () => {
        try {
          let info = listenSquadleadsInfoRef.current;
          if (!info && adapter.getSquadleadListen) {
            const fetched = await adapter.getSquadleadListen();
            if (!fetched) return;
            info = fetched;
            listenSquadleadsInfoRef.current = fetched;
          }
          if (!info) return;
          const ls = new Room({ adaptiveStream: true, dynacast: true });
          await ls.connect(info.url, info.token);
          setListenSquadleadsRoom(ls);
        } catch (e) {
          console.warn("squadleads listen attach failed", e);
        } finally {
          squadListenBusyRef.current = false;
        }
      })();
    } else if (!isSquadLead && (listenSquadleadsRoom || scopeBroadcast?.scope === "squadleads")) {
      squadListenBusyRef.current = true;
      (async () => {
        try {
          if (scopeBroadcast?.scope === "squadleads") {
            try { await scopeBroadcast.room.disconnect(); } catch { /* noop */ }
            setScopeBroadcast(null);
            try { await adapter.leaveScopeBroadcast?.(); } catch { /* noop */ }
          }
          if (listenSquadleadsRoom) {
            try { await listenSquadleadsRoom.disconnect(); } catch { /* noop */ }
            setListenSquadleadsRoom(null);
          }
          listenSquadleadsInfoRef.current = null;
        } finally {
          squadListenBusyRef.current = false;
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSquadLead, connection, listenSquadleadsRoom, scopeBroadcast]);

  const remoteBcMut = useMutation({
    mutationFn: (i: { target_participant_id: string; on: boolean }) =>
      adapter.setRemoteBroadcast?.(i) ?? Promise.resolve(),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // VOX mode lifecycle: whenever connected in VOX, keep mic captured,
  // start muted, and let the VAD effect unmute on speech.
  useEffect(() => {
    if (!connection) return;
    if (mode !== "vox") {
      // Leaving VOX -> release mic; PTT effect handles the rest.
      ensureMicEnabled(false);
      closeVoxGate();
      setRawLevelDb(VAD_SILENCE_DB);
      setLevelDb(VAD_SILENCE_DB);
      return;
    }
    let cancelled = false;
    (async () => {
      await ensureMicEnabled(true);
      if (cancelled) return;
      // Immediately mute the just-published track; VAD unmutes on speech.
      const pub = connection.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track = (pub?.track as LocalAudioTrack | undefined) ?? null;
      if (track) {
        track.mute();
        setMicTrack(track);
      }
      closeVoxGate();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, mode, closeVoxGate]);

  // VAD analyser (VOX only)
  useEffect(() => {
    if (!connection || mode !== "vox" || !micTrack) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      // Independent capture WITHOUT AGC so the analyser sees the true
      // acoustic level. AGC on the LiveKit publish track would otherwise
      // pump silence up to ~-15 dB and trigger VAD permanently.
      let vadStream: MediaStream;
      try {
        vadStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: false,
            noiseSuppression: true,
            echoCancellation: true,
          },
        });
      } catch {
        return;
      }
      if (cancelled) {
        vadStream.getTracks().forEach((t) => t.stop());
        return;
      }

      const AudioCtx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AudioCtx();
      const src = ac.createMediaStreamSource(vadStream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let raf = 0;
      let stopped = false;

      const loop = () => {
        if (stopped) return;
        const settings = vadSettingsRef.current;
        const gate = vadGateRef.current;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const rawDb = Math.max(VAD_SILENCE_DB, 20 * Math.log10(rms || 1e-8));
        const adjusted = rawDb <= settings.noiseFloorDb
          ? VAD_SILENCE_DB
          : clamp(rawDb + settings.gainDb, VAD_SILENCE_DB, VAD_OFF_THRESHOLD_DB);
        setRawLevelDb(rawDb);
        setLevelDb(adjusted);
        const now = performance.now();

        if (gate.settingsVersion !== vadSettingsVersionRef.current) {
          gate.aboveSince = 0;
          gate.lastVoiceAt = now;
          gate.settingsVersion = vadSettingsVersionRef.current;
          if (settings.startThresholdDb >= VAD_OFF_THRESHOLD_DB || adjusted < settings.startThresholdDb) {
            gate.speaking = false;
            setIsSpeaking(false);
            applyVoxGate(false);
          }
        }

        if (settings.startThresholdDb >= VAD_OFF_THRESHOLD_DB || forcedMuteRef.current) {
          gate.aboveSince = 0;
          gate.lastVoiceAt = 0;
          if (gate.speaking) {
            gate.speaking = false;
            setIsSpeaking(false);
          }
          applyVoxGate(false);
          raf = requestAnimationFrame(loop);
          return;
        }

        if (!gate.speaking) {
          if (adjusted >= settings.startThresholdDb) {
            gate.aboveSince = gate.aboveSince || now;
            if (now - gate.aboveSince >= VAD_ATTACK_MS) {
              gate.speaking = true;
              gate.lastVoiceAt = now;
              setIsSpeaking(true);
              applyVoxGate(true);
            }
          } else {
            gate.aboveSince = 0;
          }
        } else if (adjusted >= settings.stopThresholdDb) {
          gate.lastVoiceAt = now;
        } else if (now - gate.lastVoiceAt >= settings.hangoverMs) {
          gate.speaking = false;
          gate.aboveSince = 0;
          setIsSpeaking(false);
          applyVoxGate(false);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      cleanup = () => {
        stopped = true;
        cancelAnimationFrame(raf);
        try { src.disconnect(); } catch { /* noop */ }
        vadStream.getTracks().forEach((t) => t.stop());
        ac.close().catch(() => {});
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [connection, mode, micTrack, applyVoxGate]);

  // VOX gating: mute/unmute the live track based on VAD + forcedMute
  useEffect(() => {
    if (mode !== "vox" || !micTrack) return;
    applyVoxGate(isSpeaking && !forcedMute && startThresholdDb < VAD_OFF_THRESHOLD_DB);
  }, [mode, micTrack, isSpeaking, forcedMute, startThresholdDb, applyVoxGate]);

  // Sync presence is_muted with forcedMute state (stable, not per-VAD-flip)
  useEffect(() => {
    if (!connection) return;
    if (mode === "vox") {
      adapter.updateState({ is_muted: forcedMute }).catch(() => {});
    } else {
      // PTT: reflect forced mute when not held
      if (forcedMute) {
        ensureMicEnabled(false);
        adapter.updateState({ is_muted: true }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedMute, mode, connection]);

  // Deafen — mute all remote audio elements
  useEffect(() => {
    if (!connection) return;
    const rooms: Room[] = [connection.room];
    if (listenRoom) rooms.push(listenRoom.room);
    if (broadcasting) rooms.push(broadcasting.room);
    if (listenMissionRoom) rooms.push(listenMissionRoom);
    if (listenSquadleadsRoom) rooms.push(listenSquadleadsRoom);
    if (scopeBroadcast) rooms.push(scopeBroadcast.room);
    rooms.forEach((r) => {
      r.remoteParticipants.forEach((p: RemoteParticipant) => {
        p.audioTrackPublications.forEach((pub) => {
          const el = pub.track?.attachedElements[0];
          if (el) (el as HTMLMediaElement).muted = deafened;
        });
      });
    });
  }, [deafened, connection, listenRoom, broadcasting, listenMissionRoom, listenSquadleadsRoom, scopeBroadcast, presence]);

  useEffect(() => {
    if (!connection) return;
    const handler = () => {
      connection.room.remoteParticipants.forEach((p) =>
        p.audioTrackPublications.forEach((pub) => {
          const el = pub.track?.attachedElements[0];
          if (el) (el as HTMLMediaElement).muted = deafened;
        }),
      );
    };
    connection.room.on(RoomEvent.TrackSubscribed, handler);
    return () => { connection.room.off(RoomEvent.TrackSubscribed, handler); };
  }, [connection, deafened]);

  // Push-to-talk: hold Space
  useEffect(() => {
    if (!connection || mode !== "ptt") return;
    const isTyping = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.key !== PTT_KEY || e.repeat) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      setPttHeld(true);
      setPttSending(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== PTT_KEY) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      setPttHeld(false);
      setPttSending(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, mode, forcedMute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connection) {
        connection.room.disconnect().catch(() => {});
        adapter.leave().catch(() => {});
      }
      if (listenRoom) listenRoom.room.disconnect().catch(() => {});
      if (broadcasting) {
        broadcasting.room.disconnect().catch(() => {});
        adapter.leaveBroadcast?.().catch(() => {});
      }
      if (listenMissionRoom) listenMissionRoom.disconnect().catch(() => {});
      if (listenSquadleadsRoom) listenSquadleadsRoom.disconnect().catch(() => {});
      if (scopeBroadcast) {
        scopeBroadcast.room.disconnect().catch(() => {});
        adapter.leaveScopeBroadcast?.().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leave voice on page reload / tab close (unmount cleanup does not run reliably on reload).
  useEffect(() => {
    if (!connection) return;
    const bye = () => {
      try { connection.room.disconnect(); } catch { /* noop */ }
      try { listenRoom?.room.disconnect(); } catch { /* noop */ }
      try { broadcasting?.room.disconnect(); } catch { /* noop */ }
      try { listenMissionRoom?.disconnect(); } catch { /* noop */ }
      try { listenSquadleadsRoom?.disconnect(); } catch { /* noop */ }
      try { scopeBroadcast?.room.disconnect(); } catch { /* noop */ }
      // Fire-and-forget: use sendBeacon-style best-effort call.
      adapter.leave().catch(() => {});
      adapter.leaveBroadcast?.().catch(() => {});
      adapter.leaveScopeBroadcast?.().catch(() => {});
    };
    window.addEventListener("pagehide", bye);
    window.addEventListener("beforeunload", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      window.removeEventListener("beforeunload", bye);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, listenRoom, broadcasting, listenMissionRoom, listenSquadleadsRoom, scopeBroadcast]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleDelete = (id: string) => adapter.remove({ channel_id: id }).then(() => qc.invalidateQueries({ queryKey }));
  const handleRename = (id: string, name: string) => adapter.rename({ channel_id: id, name }).then(() => qc.invalidateQueries({ queryKey }));

  const renderRow = (c: VoiceChannelRow, opts?: { nested?: boolean }) => (
    <ChannelRowItem
      key={c.id}
      channel={c}
      nested={!!opts?.nested}
      presence={presence.filter((pr) => pr.channel_id === c.id)}
      active={activeChannelId === c.id}
      activeChannelId={activeChannelId}
      connecting={connecting}
      speakingIds={speakingIds}
      selfId={selfId}
      mode={mode}
      isSpeaking={isSpeaking}
      forcedMute={forcedMute}
      broadcasting={!!broadcasting}
      canManage={canManage}
      ships={ships}
      onJoin={connect}
      onLeave={disconnect}
      onDelete={handleDelete}
      onRename={handleRename}
      canSetSquadLead={canManage && !!adapter.setSquadLead}
      onToggleSquadLead={
        adapter.setSquadLead
          ? (target_participant_id, on) =>
              adapter.setSquadLead!({ target_participant_id, on })
                .then(() => qc.invalidateQueries({ queryKey }))
          : undefined
      }
    />
  );

  type CreateInput = Parameters<typeof adapter.create>[0];

  return (
    <section className="voice-panel-frame relative overflow-hidden">
      {/* Panel header */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-brand/25 px-4 py-2.5">
        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.35em] text-brand">
          <span className={`voice-led ${connection ? "is-on" : ""}`} />
          <Radio size={13} />
          <span>Schiffsfunk</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground">
            {channels.length} KANÄLE
          </span>
        </div>
        {canManage && (
          <CreateChannelDrawer
            parents={parents}
            channels={channels}
            ships={ships}
            pending={createMut.isPending}
            onCreate={(input: CreateInput, done: () => void) =>
              createMut.mutate(input, { onSuccess: () => done() })
            }
          />
        )}
      </div>

      {error && (
        <div className="relative z-10 border-b border-rose-500/40 bg-rose-500/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-rose-200">
          ⚠ {error}
        </div>
      )}

      {/* Cockpit HUD — only when in a channel */}
      {connection && (
        <div className="relative z-10 border-b border-brand/25 bg-background/70 px-4 py-3 backdrop-blur">
          {scopeBroadcast && (
            <button
              type="button"
              onClick={() => stopScopeBroadcast()}
              disabled={scopeBroadcastBusy}
              className={`voice-onair-banner ${scopeBroadcast.scope === "squadleads" ? "scope-squadleads" : "scope-mission"} -mx-4 -mt-3 mb-3 w-[calc(100%+2rem)] cursor-pointer disabled:opacity-60`}
              title="Klicken zum Beenden"
            >
              <span className={`voice-led ${scopeBroadcast.scope === "squadleads" ? "is-squadlead" : "is-broadcast"}`} />
              <span className="font-bold">ON AIR</span>
              <span>·</span>
              <span>
                {scopeBroadcast.scope === "squadleads"
                  ? "Squadlead-Funk aktiv — nur Squadleads hören dich"
                  : "Einsatzweiter Funk aktiv — alle Kanäle hören dich"}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-[9px] opacity-90">
                <span className={`voice-transmit-bar is-live`}>
                  <span /><span /><span /><span />
                </span>
                Stop
              </span>
            </button>
          )}
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            {/* Left: identity + controls */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
                <Signal size={11} className="text-brand" /> Aktiver Kanal
                <span className="ml-auto lg:hidden" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {activeParent && (
                  <>
                    <span className="font-mono text-xs uppercase tracking-[0.2em] text-brand/70">{activeParent.name}</span>
                    <span className="text-muted-foreground">›</span>
                  </>
                )}
                <span className="font-mono text-base uppercase tracking-[0.15em] text-brand" style={{ textShadow: "0 0 8px color-mix(in oklab, var(--brand) 40%, transparent)" }}>
                  {activeChannel?.name}
                </span>
                {broadcasting && (
                  <span className="inline-flex items-center gap-1.5 border border-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-200">
                    <span className="voice-led is-broadcast" /> Schiffsweit live
                  </span>
                )}
                {scopeBroadcast?.scope === "mission" && (
                  <span className="inline-flex items-center gap-1.5 border border-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-200">
                    <span className="voice-led is-broadcast" /> Einsatzweit live
                  </span>
                )}
                {scopeBroadcast?.scope === "squadleads" && (
                  <span className="inline-flex items-center gap-1.5 border border-amber-400/70 bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-amber-200">
                    <span className="voice-led is-squadlead" /> Squadlead-Funk live
                  </span>
                )}
                {connecting && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">· verbinde…</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <div className="inline-flex overflow-hidden border border-brand/40 font-mono">
                  <button
                    onClick={() => setMode("ptt")}
                    className={`px-2.5 py-1.5 text-[10px] uppercase tracking-[0.25em] ${mode === "ptt" ? "bg-brand text-primary-foreground" : "text-brand hover:bg-brand/10"}`}
                  >
                    PTT
                  </button>
                  <button
                    onClick={() => setMode("vox")}
                    className={`border-l border-brand/40 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.25em] ${mode === "vox" ? "bg-brand text-primary-foreground" : "text-brand hover:bg-brand/10"}`}
                  >
                    VOX
                  </button>
                </div>
                <button
                  onClick={() => setForcedMute((v) => !v)}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] transition ${
                    forcedMute
                      ? "border-rose-400/70 bg-rose-500/15 text-rose-200"
                      : micOn
                      ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200"
                      : "border-brand/40 text-brand hover:bg-brand/10"
                  }`}
                  title={forcedMute ? "Stumm aufheben" : "Stummschalten"}
                >
                  {forcedMute ? <MicOff size={12} /> : <Mic size={12} />}
                  {forcedMute ? "Mikro Aus" : micOn ? "Mikro Live" : "Mikro Bereit"}
                </button>
                <button
                  onClick={() => setDeafened((d) => !d)}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] transition ${
                    deafened
                      ? "border-rose-400/70 bg-rose-500/15 text-rose-200"
                      : "border-brand/40 text-brand hover:bg-brand/10"
                  }`}
                >
                  {deafened ? <HeadphoneOff size={12} /> : <Headphones size={12} />}
                  {deafened ? "Lautsprecher Aus" : "Lautsprecher An"}
                </button>
                <button
                  onClick={disconnect}
                  className="flex items-center gap-1.5 border border-brand/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:border-rose-400/60 hover:text-rose-200"
                >
                  <LogOut size={12} /> Kanal verlassen
                </button>
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] ${settingsOpen ? "border-brand text-brand" : "border-brand/30 text-muted-foreground hover:text-brand"}`}
                >
                  <Settings2 size={12} /> Funk-Einstellungen
                </button>
                <span className={`ml-1 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] ${micOn ? "text-emerald-300" : "text-muted-foreground"}`}>
                  <span className={`voice-transmit-bar ${micOn ? "is-live" : ""}`}>
                    <span /><span /><span /><span />
                  </span>
                  {mode === "ptt"
                    ? pttHeld ? "Sendet · Space" : "Space halten"
                    : isSpeaking && !forcedMute ? "Sendet" : "Lauscht"}
                </span>
              </div>
            </div>

            {/* Right: broadcast tile */}
            <div className="flex flex-col justify-center gap-1.5 min-w-[240px]">
              {canBroadcast ? (
                <button
                  onClick={() => (broadcasting ? stopBroadcast() : startBroadcast())}
                  disabled={broadcastBusy || !!scopeBroadcast}
                  className={`voice-broadcast-btn ${broadcasting ? "is-live" : ""} flex flex-col items-center gap-1 px-4 py-3 font-mono uppercase disabled:opacity-50`}
                  title={broadcasting ? `Broadcast an ${activeParent?.name} beenden` : `Schiffsweit an ${activeParent?.name} senden`}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <Megaphone size={14} />
                    {broadcasting ? "Broadcast aktiv" : "Schiffsweit senden"}
                  </div>
                  <div className="text-[9px] tracking-[0.35em] opacity-80">
                    {broadcasting ? "klicken zum beenden" : activeParent?.name ?? ""}
                  </div>
                </button>
              ) : activeParent ? (
                <div className="border border-dashed border-brand/20 bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
                  Broadcast für „{activeParent.name}" ist deaktiviert
                </div>
              ) : (
                <div className="border border-dashed border-brand/20 bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
                  Kanal ohne Übergruppe · kein Broadcast
                </div>
              )}
              {adapter.joinScopeBroadcast && (
                <button
                  onClick={() =>
                    scopeBroadcast?.scope === "mission"
                      ? stopScopeBroadcast()
                      : startScopeBroadcast("mission")
                  }
                  disabled={scopeBroadcastBusy || !!broadcasting || (!!scopeBroadcast && scopeBroadcast.scope !== "mission")}
                  className={`voice-broadcast-btn ${scopeBroadcast?.scope === "mission" ? "is-live" : ""} flex flex-col items-center gap-1 px-4 py-2 font-mono uppercase disabled:opacity-50`}
                  title="An alle Kanäle des Einsatzes senden"
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <Megaphone size={14} />
                    {scopeBroadcast?.scope === "mission" ? "Einsatzfunk aktiv" : "Einsatzweit senden"}
                  </div>
                  <div className="text-[9px] tracking-[0.35em] opacity-80">
                    {scopeBroadcast?.scope === "mission" ? "klicken zum beenden" : "alle Stationen"}
                  </div>
                </button>
              )}
              {adapter.joinScopeBroadcast && isSquadLead && (
                <button
                  onClick={() =>
                    scopeBroadcast?.scope === "squadleads"
                      ? stopScopeBroadcast()
                      : startScopeBroadcast("squadleads")
                  }
                  disabled={scopeBroadcastBusy || !!broadcasting || (!!scopeBroadcast && scopeBroadcast.scope !== "squadleads")}
                  className={`voice-broadcast-btn is-squadlead ${scopeBroadcast?.scope === "squadleads" ? "is-live" : ""} flex flex-col items-center gap-1 px-4 py-2 font-mono uppercase disabled:opacity-50`}
                  title="Nur an markierte Squadleads senden"
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    {scopeBroadcast?.scope === "squadleads" ? (
                      <span className="voice-led is-squadlead" />
                    ) : (
                      <Radio size={14} />
                    )}
                    {scopeBroadcast?.scope === "squadleads" ? "◉ Sendet an Squadleads" : "Squadlead-Funk starten"}
                  </div>
                  <div className="text-[9px] tracking-[0.35em] opacity-80">
                    {scopeBroadcast?.scope === "squadleads" ? "klicken zum stoppen" : "nur Squadleads hören"}
                  </div>
                </button>
              )}
            </div>
          </div>

          {settingsOpen && mode === "vox" && (
            <div className="mt-3 border-t border-brand/15 pt-3">
              <VoxMeter
                levelDb={levelDb}
                rawLevelDb={rawLevelDb}
                thresholdDb={startThresholdDb}
                stopThresholdDb={stopThresholdDb}
                gainDb={gainDb}
                noiseFloorDb={noiseFloorDb}
                hangoverMs={hangoverMs}
                onThresholdChange={setVoxSensitivity}
                onStopThresholdChange={setVoxStopThreshold}
                onGainChange={setGainDb}
                onNoiseFloorChange={setNoiseFloorDb}
                onHangoverChange={setHangoverMs}
                onCalibrateNoise={() => setNoiseFloorDb(clamp(Math.ceil(rawLevelDb + 3), VAD_DISPLAY_MIN_DB, -20))}
                speaking={isSpeaking && !forcedMute}
              />
            </div>
          )}
          {settingsOpen && mode === "ptt" && (
            <div className="mt-3 border-t border-brand/15 pt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              <span className="text-brand">PTT</span> · halte <KeyRound size={10} className="inline"/> <span className="text-brand">Leertaste</span> zum Senden · wechsle oben auf VOX für Sprachaktivierung
            </div>
          )}
          {canManage && adapter.setSquadLead && (
            <div className="mt-3 border-t border-brand/15 pt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-amber-200/70">
              <Star size={10} className="inline mr-1" /> Squadleads werden direkt am Teilnehmer im Kanal ernannt · sie hören und senden im Squadlead-Funk kanalübergreifend
            </div>
          )}
        </div>
      )}

      {/* Channel tree */}
      <div className="relative z-10">
        {parents.length > 0 && (
          <div className="border-b border-brand/10 px-4 py-3">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <Rocket size={12} className="text-brand" /> Multicrew-Schiffe
            </div>
            <div className="space-y-3">
              {parents.map((p) => {
                const kids = childrenByParent.get(p.id) ?? [];
                const totalPresence = kids.reduce((n, c) => n + presence.filter((pr) => pr.channel_id === c.id).length, 0);
                const bcAllowed = p.allow_broadcast !== false;
                const isBroadcastParent = broadcasting?.parentId === p.id;
                return (
                  <div key={p.id} className={`border ${isBroadcastParent ? "border-cyan-400/60" : "border-brand/20"} bg-background/40`}>
                    <div className={`voice-parent-header flex items-center justify-between gap-2 px-3 py-2 ${isBroadcastParent ? "!border-cyan-400/40" : ""}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Rocket size={14} className={isBroadcastParent ? "text-cyan-300" : "text-brand"} />
                        <span className="font-mono text-sm uppercase tracking-[0.15em] text-foreground truncate">{p.name}</span>
                        <span className="ml-1 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                          <Users size={9}/> {totalPresence}
                        </span>
                        {bcAllowed ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.25em] text-cyan-300/80">
                            <Megaphone size={9}/> Broadcast
                          </span>
                        ) : (
                          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">Broadcast aus</span>
                        )}
                        {isBroadcastParent && (
                          <span className="inline-flex items-center gap-1 border border-cyan-400/60 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-100">
                            <span className="voice-led is-broadcast" /> LIVE
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          {adapter.updateSettings && (
                            <button
                              onClick={() =>
                                adapter.updateSettings!({ channel_id: p.id, allow_broadcast: !bcAllowed })
                                  .then(() => qc.invalidateQueries({ queryKey }))
                              }
                              className="border border-brand/20 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70 hover:text-brand"
                              title="Broadcast erlauben/verbieten"
                            >
                              BC {bcAllowed ? "an" : "aus"}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const name = prompt("Neuer Name", p.name);
                              if (name && name.trim()) handleRename(p.id, name.trim());
                            }}
                            className="border border-brand/20 p-1 text-brand/70 hover:text-brand"
                            title="Umbenennen"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Übergruppe „${p.name}" (inkl. Untergruppen) löschen?`)) handleDelete(p.id); }}
                            className="border border-rose-400/30 p-1 text-rose-300 hover:bg-rose-500/20"
                            title="Löschen"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      {kids.length === 0 ? (
                        <p className="px-2 py-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
                          // keine Stationen · lege eine Untergruppe an
                        </p>
                      ) : (
                        <>
                          {adapter.setRemoteBroadcast && bcAllowed && (() => {
                            const members = kids.flatMap((c) => presence.filter((pr) => pr.channel_id === c.id));
                            if (members.length === 0) return null;
                            return (
                              <div className="mb-2 border border-cyan-400/25 bg-cyan-500/5 px-2.5 py-2">
                                <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-200/80">
                                  <Megaphone size={10} /> Schiffsweiter Funk · für Crew freigeben
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {members.map((m) => {
                                    const on = !!m.is_broadcasting;
                                    const isSelf = m.participant_id === selfId;
                                    const busy = remoteBcMut.isPending && remoteBcMut.variables?.target_participant_id === m.participant_id;
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => remoteBcMut.mutate({ target_participant_id: m.participant_id, on: !on })}
                                        disabled={busy}
                                        className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] transition disabled:opacity-50 ${
                                          on
                                            ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30"
                                            : "border-brand/25 bg-background/60 text-muted-foreground hover:border-cyan-400/60 hover:text-cyan-200"
                                        }`}
                                        title={on
                                          ? `Schiffsweiten Funk für ${m.display_name} schließen`
                                          : `Schiffsweiten Funk für ${m.display_name} öffnen`}
                                      >
                                        <span className={`voice-led ${on ? "is-broadcast" : ""}`} style={{ width: 6, height: 6 }} />
                                        {on ? <Radio size={10} /> : <Megaphone size={10} />}
                                        <span className="truncate max-w-[10rem]">{m.display_name}{isSelf ? " (du)" : ""}</span>
                                        <span className="opacity-70">{on ? "AN" : "aus"}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
                                  Ein Klick öffnet der Person den ship-weiten Kanal — sie sendet dann in alle Stationen. Erneut klicken schließt ihn wieder.
                                </p>
                              </div>
                            );
                          })()}
                          <ul className="space-y-1.5">
                            {kids.map((c) => renderRow(c, { nested: true }))}
                          </ul>
                        </>
                      )}
                      {canManage && (
                        <QuickAddChild
                          onAdd={(name) => createMut.mutate({ name, kind: "group", parent_id: p.id, is_group_parent: false })}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {grouped.command.length > 0 && (
          <FlatSection title="Kommando" icon={<Radio size={12} className="text-brand" />}>
            {grouped.command.map((c) => renderRow(c))}
          </FlatSection>
        )}
        {grouped.ship.length > 0 && (
          <FlatSection title="Schiffe" icon={<Rocket size={12} className="text-brand" />}>
            {grouped.ship.map((c) => renderRow(c))}
          </FlatSection>
        )}
        {grouped.group.length > 0 && (
          <FlatSection title="Gruppen" icon={<Users size={12} className="text-brand" />}>
            {grouped.group.map((c) => renderRow(c))}
          </FlatSection>
        )}

        {channels.length === 0 && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center border border-brand/30 text-brand">
              <Radio size={20} />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Kein Funknetz aktiv
            </p>
            {canManage && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                Lege oben rechts einen Kanal an
              </p>
            )}
          </div>
        )}
      </div>

      {/* Auto-attach remote audio */}
      {connection && <RemoteAudio room={connection.room} muted={deafened} />}
      {listenRoom && <RemoteAudio room={listenRoom.room} muted={deafened} />}
      {broadcasting && <RemoteAudio room={broadcasting.room} muted={deafened} />}
      {listenMissionRoom && <RemoteAudio room={listenMissionRoom} muted={deafened} />}
      {listenSquadleadsRoom && <RemoteAudio room={listenSquadleadsRoom} muted={deafened} />}
      {scopeBroadcast && <RemoteAudio room={scopeBroadcast.room} muted={deafened} />}
    </section>
  );
}

type PresenceRow = VoicePresenceRow;
type ChannelRow = VoiceChannelRow;

function FlatSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-brand/10 px-4 py-3 last:border-b-0">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {icon} {title}
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function RemoteAudio({ room, muted }: { room: Room; muted: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const attach = (track: unknown) => {
      const t = track as { kind: string; attach: () => HTMLMediaElement };
      if (t.kind !== "audio") return;
      const el = t.attach();
      (el as HTMLMediaElement).muted = muted;
      container.appendChild(el);
    };
    const detach = (track: unknown) => {
      const t = track as { detach: () => HTMLMediaElement[] };
      t.detach().forEach((el) => el.remove());
    };
    room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => { if (pub.track) attach(pub.track); });
    });
    const onSub = (track: unknown) => attach(track);
    const onUnsub = (track: unknown) => detach(track);
    room.on(RoomEvent.TrackSubscribed, onSub);
    room.on(RoomEvent.TrackUnsubscribed, onUnsub);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSub);
      room.off(RoomEvent.TrackUnsubscribed, onUnsub);
      container.innerHTML = "";
    };
  }, [room, muted]);
  return <div ref={containerRef} className="hidden" />;
}

function VoxMeter({
  levelDb,
  rawLevelDb,
  thresholdDb,
  stopThresholdDb,
  gainDb,
  noiseFloorDb,
  hangoverMs,
  onThresholdChange,
  onStopThresholdChange,
  onGainChange,
  onNoiseFloorChange,
  onHangoverChange,
  onCalibrateNoise,
  speaking,
}: {
  levelDb: number;
  rawLevelDb: number;
  thresholdDb: number;
  stopThresholdDb: number;
  gainDb: number;
  noiseFloorDb: number;
  hangoverMs: number;
  onThresholdChange: (v: number) => void;
  onStopThresholdChange: (v: number) => void;
  onGainChange: (v: number) => void;
  onNoiseFloorChange: (v: number) => void;
  onHangoverChange: (v: number) => void;
  onCalibrateNoise: () => void;
  speaking: boolean;
}) {
  // Map dB range [-90, 0] to 0..100 for visual bars
  const toPct = (db: number) => {
    const min = VAD_DISPLAY_MIN_DB;
    const max = VAD_OFF_THRESHOLD_DB;
    return Math.max(0, Math.min(100, ((db - min) / (max - min)) * 100));
  };
  const levelPct = toPct(levelDb);
  const rawPct = toPct(rawLevelDb);
  const threshPct = toPct(thresholdDb);
  const stopPct = toPct(stopThresholdDb);
  const floorPct = toPct(noiseFloorDb);
  const disabled = thresholdDb >= VAD_OFF_THRESHOLD_DB;
  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span>Start-Schwelle</span>
            <span>{disabled ? "VOX aus" : `${thresholdDb} dB`}</span>
          </div>
          <input
            type="range"
            min={VAD_MIN_THRESHOLD_DB}
            max={VAD_OFF_THRESHOLD_DB}
            step={1}
            value={thresholdDb}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            className="w-full accent-brand"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span>Stop-Schwelle</span>
            <span>{stopThresholdDb} dB</span>
          </div>
          <input
            type="range"
            min={VAD_DISPLAY_MIN_DB}
            max={Math.min(thresholdDb - VAD_MIN_GATE_GAP_DB, VAD_OFF_THRESHOLD_DB - VAD_MIN_GATE_GAP_DB)}
            step={1}
            value={stopThresholdDb}
            onChange={(e) => onStopThresholdChange(Number(e.target.value))}
            className="w-full accent-brand"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span>Noise-Floor</span>
            <span>{noiseFloorDb} dB</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={VAD_DISPLAY_MIN_DB}
              max={-20}
              step={1}
              value={noiseFloorDb}
              onChange={(e) => onNoiseFloorChange(Number(e.target.value))}
              className="min-w-0 flex-1 accent-brand"
            />
            <button
              type="button"
              onClick={onCalibrateNoise}
              className="border border-brand/30 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
            >
              Kalibrieren
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Gain</span>
              <span>{gainDb} dB</span>
            </div>
            <input
              type="range"
              min={-10}
              max={30}
              step={1}
              value={gainDb}
              onChange={(e) => onGainChange(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Nachlauf</span>
              <span>{hangoverMs} ms</span>
            </div>
            <input
              type="range"
              min={50}
              max={1000}
              step={50}
              value={hangoverMs}
              onChange={(e) => onHangoverChange(Number(e.target.value))}
              className="w-full accent-brand"
            />
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>{disabled ? "VOX aus" : speaking ? "spricht / sendet" : "lauscht"}</span>
          <span>Roh {Math.round(rawLevelDb)} dB · Gate {Math.round(levelDb)} dB</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden border border-brand/20 bg-background/40">
          <div
            className="absolute inset-y-0 bg-brand/20"
            style={{ width: `${rawPct}%` }}
            title="Rohpegel"
          />
          <div
            className={`relative h-full transition-[width] duration-75 ${speaking ? "bg-emerald-400" : disabled ? "bg-muted-foreground/40" : "bg-brand/70"}`}
            style={{ width: `${levelPct}%` }}
            title="Ausgewerteter Pegel"
          />
          <div
            className="absolute top-0 h-full w-px bg-muted-foreground"
            style={{ left: `${floorPct}%` }}
            title="Noise-Floor"
          />
          <div
            className="absolute top-0 h-full w-px bg-amber-300"
            style={{ left: `${stopPct}%` }}
            title="Stop-Schwelle"
          />
          <div
            className="absolute top-0 h-full w-px bg-rose-300"
            style={{ left: `${threshPct}%` }}
            title="Start-Schwelle"
          />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Grau Noise</span>
          <span>Gelb Stop</span>
          <span>Rot Start</span>
        </div>
      </div>
    </div>
  );
}
function ChannelRowItem({
  channel, presence, active, connecting, speakingIds, selfId, mode, isSpeaking, forcedMute, activeChannelId, broadcasting, canManage, nested, ships, onJoin, onLeave, onDelete, onRename, canSetSquadLead, onToggleSquadLead,
}: {
  channel: ChannelRow;
  presence: PresenceRow[];
  active: boolean;
  connecting: string | null;
  speakingIds: Set<string>;
  selfId: string;
  mode: VoiceMode;
  isSpeaking: boolean;
  forcedMute: boolean;
  activeChannelId: string | null;
  broadcasting?: boolean;
  canManage: boolean;
  nested?: boolean;
  ships: ShipRef[];
  onJoin: (id: string) => void;
  onLeave: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  canSetSquadLead?: boolean;
  onToggleSquadLead?: (target_participant_id: string, on: boolean) => void;
}) {
  const shipLabel = channel.ship_id ? ships.find((s) => s.id === channel.ship_id)?.ship_name : null;
  const activeClass = active
    ? broadcasting
      ? "voice-row is-broadcast"
      : "voice-row is-active"
    : "voice-row";
  return (
    <li className={`${activeClass} border border-brand/15 bg-background/30 px-3 py-2 hover:border-brand/40`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`voice-led ${active ? (broadcasting ? "is-broadcast" : "is-live") : presence.length > 0 ? "is-on" : ""}`} />
            {nested && <span className="font-mono text-brand/40">↳</span>}
            <span className="font-mono text-sm uppercase tracking-[0.12em] text-foreground truncate">
              {channel.name}
            </span>
            {shipLabel && (
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">· {shipLabel}</span>
            )}
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              {presence.length}
            </span>
          </div>
          {presence.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
              {presence.map((p) => {
                const isLocal = p.participant_id === selfId;
                const localSpeaking = isLocal && mode === "vox" && isSpeaking && !forcedMute && !p.is_muted;
                const speaking = speakingIds.has(p.participant_id) || localSpeaking;
                const isLead = !!p.is_squad_lead;
                return (
                  <span
                    key={p.id}
                    className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${
                      isLead
                        ? "border-amber-400/60 bg-amber-500/10 text-amber-100"
                        : speaking
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                        : p.is_muted
                        ? "border-rose-400/30 bg-rose-500/5 text-rose-200/80"
                        : "border-brand/20 bg-background/40 text-muted-foreground"
                    }`}
                  >
                    <span className={`voice-led ${speaking ? "is-live" : p.is_muted ? "is-mute" : ""}`} style={{ width: 6, height: 6 }} />
                    {p.is_muted ? <MicOff size={9} /> : <Mic size={9} />}
                    {p.display_name}
                    {isLead && (
                      <span className="inline-flex items-center gap-0.5 border border-amber-400/60 bg-amber-500/20 px-1 py-[1px] font-mono text-[8px] uppercase tracking-[0.2em] text-amber-100">
                        <Star size={8} /> LEAD
                      </span>
                    )}
                    {canSetSquadLead && onToggleSquadLead && (
                      <button
                        type="button"
                        onClick={() => onToggleSquadLead(p.participant_id, !isLead)}
                        title={isLead ? `${p.display_name} als Squadlead entfernen` : `${p.display_name} zum Squadlead ernennen`}
                        className={`ml-0.5 inline-flex items-center justify-center border p-[2px] transition ${
                          isLead
                            ? "border-amber-400/60 text-amber-100 hover:bg-amber-500/30"
                            : "border-brand/30 text-muted-foreground hover:border-amber-400/60 hover:text-amber-200"
                        }`}
                      >
                        <Star size={9} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {active ? (
            <button
              onClick={onLeave}
              className="flex items-center gap-1 border border-rose-400/60 bg-rose-500/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-rose-200 hover:bg-rose-500/30"
            >
              <LogOut size={11} /> Verlassen
            </button>
          ) : (
            <button
              onClick={() => onJoin(channel.id)}
              disabled={connecting === channel.id}
              className={`flex items-center gap-1 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] disabled:opacity-50 ${
                activeChannelId
                  ? "border-brand/40 text-brand hover:bg-brand hover:text-primary-foreground"
                  : "border-brand bg-brand text-primary-foreground hover:bg-brand/80"
              }`}
            >
              {connecting === channel.id ? "…" : activeChannelId ? "Wechseln" : "Beitreten"}
            </button>
          )}
          {canManage && (
            <>
              <button
                onClick={() => {
                  const name = prompt("Neuer Name", channel.name);
                  if (name && name.trim()) onRename(channel.id, name.trim());
                }}
                className="border border-brand/20 p-1.5 text-brand/70 hover:text-brand"
                title="Umbenennen"
              >
                <Pencil size={11} />
              </button>
              <button
                onClick={() => { if (confirm(`Channel „${channel.name}" löschen?`)) onDelete(channel.id); }}
                className="border border-rose-400/30 p-1.5 text-rose-300 hover:bg-rose-500/20"
                title="Löschen"
              >
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function QuickAddChild({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        onAdd(n);
        setName("");
      }}
      className="mt-2 flex items-center gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ neue Station (z.B. Brücke)"
        className="min-w-0 flex-1 border border-brand/20 bg-background/40 px-2 py-1.5 font-mono text-xs uppercase tracking-[0.15em] focus:border-brand focus:outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="border border-brand/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-brand hover:bg-brand hover:text-primary-foreground disabled:opacity-50"
      >
        <Plus size={11} />
      </button>
    </form>
  );
}

type CreateChannelInput = {
  name: string;
  kind: "command" | "ship" | "group";
  ship_id?: string | null;
  parent_id?: string | null;
  is_group_parent?: boolean;
  allow_broadcast?: boolean;
};

type ChannelMode = "flat" | "parent" | "child";

const CHILD_NAME_SUGGESTIONS = ["Brücke", "Gunner", "Engineering", "Fliegerstaffel", "Marines", "Medbay"];

function CreateChannelDrawer({
  parents, channels, ships, pending, onCreate,
}: {
  parents: VoiceChannelRow[];
  channels: VoiceChannelRow[];
  ships: ShipRef[];
  pending: boolean;
  onCreate: (input: CreateChannelInput, done: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ChannelMode>("flat");
  const [kind, setKind] = useState<"command" | "ship" | "group">("group");
  const [shipId, setShipId] = useState("");
  const [parentId, setParentId] = useState("");
  const [allowBroadcast, setAllowBroadcast] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setName(""); setMode("flat"); setKind("group"); setShipId(""); setParentId("");
    setAllowBroadcast(true); setError(null);
  };

  const close = useCallback(() => {
    setEntered(false);
    setTimeout(() => { setOpen(false); reset(); }, 200);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setEntered(true), 10);
    const focusT = setTimeout(() => nameRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t); clearTimeout(focusT);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const activeParent = parents.find((p) => p.id === parentId);
  const existingChildren = parentId
    ? channels.filter((c) => c.parent_id === parentId).map((c) => c.name)
    : [];

  const preview =
    mode === "child"
      ? `${activeParent?.name?.toUpperCase() ?? "?"} › ${name.trim().toUpperCase() || "…"}`
      : mode === "parent"
      ? `${name.trim().toUpperCase() || "…"} (Übergruppe)`
      : name.trim().toUpperCase() || "…";

  const valid =
    !!name.trim() &&
    (mode !== "child" || !!parentId) &&
    (mode !== "flat" || kind !== "ship" || !!shipId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    setError(null);
    const n = name.trim();
    const input: CreateChannelInput =
      mode === "parent"
        ? { name: n, kind: "group", is_group_parent: true, allow_broadcast: allowBroadcast, parent_id: null, ship_id: null }
        : mode === "child"
        ? { name: n, kind: "group", parent_id: parentId || null, is_group_parent: false }
        : {
            name: n, kind,
            ship_id: kind === "ship" ? shipId || null : null,
            parent_id: null, is_group_parent: false,
          };
    try {
      onCreate(input, () => close());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-brand bg-brand/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand hover:text-primary-foreground"
      >
        <Plus size={12} /> Kanal
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            onClick={close}
            className={`absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
          />

          {/* Drawer */}
          <form
            onSubmit={submit}
            className={`voice-drawer absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-brand/40 bg-background shadow-[0_0_60px_-10px_hsl(var(--brand)/0.4)] transition-transform duration-200 ease-out ${entered ? "translate-x-0" : "translate-x-full"}`}
          >
            {/* Header */}
            <header className="flex items-center justify-between gap-3 border-b border-brand/25 bg-background/95 px-5 py-4 backdrop-blur">
              <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.35em] text-brand">
                <Radio size={14} />
                <span>Neuer Funkkanal</span>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Schließen"
                className="border border-brand/20 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:border-brand/50 hover:text-foreground"
              >
                ✕ ESC
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {error && (
                <div className="mb-4 border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-rose-200">
                  ⚠ {error}
                </div>
              )}

              {/* Step 1 — type cards */}
              <div className="mb-5">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  1 · Kanal-Typ
                </div>
                <div className="space-y-2">
                  {(
                    [
                      { id: "flat" as const, icon: <Radio size={16} />, title: "Einzelkanal", desc: "Ein eigenständiger Kanal, keine Schiffszuordnung." },
                      { id: "parent" as const, icon: <Rocket size={16} />, title: "Schiffs-Übergruppe", desc: "Sammelkanal für ein Schiff, kann schiffsweit senden. Beitritt über Untergruppen." },
                      { id: "child" as const, icon: <Users size={16} />, title: "Untergruppe", desc: "Station innerhalb einer Übergruppe (Brücke, Gunner, Engineering …)." },
                    ]
                  ).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setMode(c.id)}
                      className={`flex w-full items-start gap-3 border px-4 py-3 text-left transition ${
                        mode === c.id
                          ? "border-brand bg-brand/10 shadow-[0_0_20px_-8px_hsl(var(--brand)/0.6)]"
                          : "border-brand/15 bg-background/40 hover:border-brand/40 hover:bg-brand/5"
                      }`}
                    >
                      <span className={`mt-0.5 ${mode === c.id ? "text-brand" : "text-muted-foreground"}`}>{c.icon}</span>
                      <span className="flex-1">
                        <span className={`block font-mono text-[11px] uppercase tracking-[0.3em] ${mode === c.id ? "text-brand" : "text-foreground"}`}>
                          {c.title}
                        </span>
                        <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                          {c.desc}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2 — details */}
              <div className="mb-5">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  2 · Details
                </div>

                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.25em] text-brand/80">Name</label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === "parent" ? "z.B. Perseus" : mode === "child" ? "z.B. Brücke" : "Kanalname"}
                  className="mb-1 w-full border border-brand/30 bg-background/60 px-3 py-2.5 font-mono text-sm uppercase tracking-[0.1em] focus:border-brand focus:outline-none"
                />

                {mode === "child" && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {CHILD_NAME_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setName(s)}
                        className="border border-brand/20 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:border-brand/50 hover:text-brand"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                )}

                {mode === "flat" && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.25em] text-brand/80">Kategorie</label>
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as "command" | "ship" | "group")}
                        className="w-full border border-brand/25 bg-background/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em]"
                      >
                        <option value="group">Gruppe</option>
                        <option value="command">Kommando</option>
                        <option value="ship">Schiff</option>
                      </select>
                    </div>
                    {kind === "ship" && (
                      <div>
                        <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.25em] text-brand/80">Schiff</label>
                        <select
                          value={shipId}
                          onChange={(e) => setShipId(e.target.value)}
                          className="w-full border border-brand/25 bg-background/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em]"
                        >
                          <option value="">— Schiff wählen —</option>
                          {ships.map((s) => (
                            <option key={s.id} value={s.id}>{s.ship_name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {mode === "child" && (
                  <div className="mt-3">
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.25em] text-brand/80">Übergruppe</label>
                    {parents.length === 0 ? (
                      <div className="border border-amber-500/30 bg-amber-500/5 p-3">
                        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">
                          Noch keine Übergruppe vorhanden
                        </div>
                        <p className="mb-2 text-[12px] text-muted-foreground">
                          Erstelle zuerst eine Schiffs-Übergruppe, in die diese Station eingehängt wird.
                        </p>
                        <button
                          type="button"
                          onClick={() => setMode("parent")}
                          className="border border-brand bg-brand/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-brand hover:bg-brand hover:text-primary-foreground"
                        >
                          → Übergruppe anlegen
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {parents.map((p) => (
                          <label
                            key={p.id}
                            className={`flex cursor-pointer items-center gap-3 border px-3 py-2 transition ${
                              parentId === p.id
                                ? "border-brand bg-brand/10"
                                : "border-brand/15 bg-background/40 hover:border-brand/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name="parent"
                              checked={parentId === p.id}
                              onChange={() => setParentId(p.id)}
                              className="accent-brand"
                            />
                            <Rocket size={13} className="text-muted-foreground" />
                            <span className="flex-1 font-mono text-[11px] uppercase tracking-[0.2em]">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {existingChildren.length > 0 && (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Bereits vorhanden:{" "}
                        {existingChildren.map((n) => (
                          <span key={n} className="mr-1 inline-block border border-brand/15 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]">
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {mode === "parent" && (
                  <label className="mt-3 flex cursor-pointer items-start gap-3 border border-brand/20 bg-background/40 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allowBroadcast}
                      onChange={(e) => setAllowBroadcast(e.target.checked)}
                      className="mt-1 accent-brand"
                    />
                    <span className="flex-1">
                      <span className="block font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
                        Schiffsweiten Broadcast erlauben
                      </span>
                      <span className="mt-1 block text-[12px] text-muted-foreground">
                        Mitglieder dürfen aus einer Untergruppe an alle Untergruppen dieser Übergruppe senden.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Sticky footer */}
            <footer className="flex items-center justify-between gap-3 border-t border-brand/25 bg-background/95 px-5 py-3 backdrop-blur">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">Wird angelegt</div>
                <div className="truncate font-mono text-[11px] uppercase tracking-[0.2em] text-brand">{preview}</div>
              </div>
              <button
                type="button"
                onClick={close}
                className="border border-brand/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:border-brand/50 hover:text-foreground"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!valid || pending}
                title={!valid ? "Bitte Pflichtfelder ausfüllen" : ""}
                className="flex items-center gap-1.5 border border-brand bg-brand px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-primary-foreground hover:bg-brand/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Wird angelegt …" : <><Plus size={12} /> Kanal anlegen</>}
              </button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
