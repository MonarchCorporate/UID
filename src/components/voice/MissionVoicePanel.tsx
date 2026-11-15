import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { VoicePanel, type ShipRef, type VoiceAdapter } from "./VoicePanel";
import {
  createVoiceChannel,
  deleteVoiceChannel,
  joinVoiceChannel,
  leaveVoiceChannel,
  listVoiceChannels,
  renameVoiceChannel,
  updateVoiceState,
  setParticipantBroadcast,
  joinBroadcastRoom,
  leaveBroadcastRoom,
  joinScopeBroadcast,
  leaveScopeBroadcast,
  setSquadLead,
  getSquadleadListenToken,
} from "@/lib/voice.functions";

type Props = {
  missionId: string;
  participantToken: string;
  participantId: string;
  isLeader: boolean;
  ships: ShipRef[];
};

export function MissionVoicePanel({ missionId, participantToken, participantId, isLeader, ships }: Props) {
  const listFn = useServerFn(listVoiceChannels);
  const createFn = useServerFn(createVoiceChannel);
  const renameFn = useServerFn(renameVoiceChannel);
  const deleteFn = useServerFn(deleteVoiceChannel);
  const joinFn = useServerFn(joinVoiceChannel);
  const leaveFn = useServerFn(leaveVoiceChannel);
  const updateStateFn = useServerFn(updateVoiceState);
  const setRemoteBcFn = useServerFn(setParticipantBroadcast);
  const joinBcFn = useServerFn(joinBroadcastRoom);
  const leaveBcFn = useServerFn(leaveBroadcastRoom);
  const joinScopeFn = useServerFn(joinScopeBroadcast);
  const leaveScopeFn = useServerFn(leaveScopeBroadcast);
  const setSquadLeadFn = useServerFn(setSquadLead);
  const getSquadListenFn = useServerFn(getSquadleadListenToken);

  const adapter: VoiceAdapter = useMemo(() => ({
    scopeKey: `mission:${missionId}`,
    realtime: [
      { table: "mission_voice_channels", filter: `mission_id=eq.${missionId}` },
      { table: "mission_voice_presence", filter: `mission_id=eq.${missionId}` },
    ],
    list: () => listFn({ data: { mission_id: missionId, token: participantToken } }),
    create: (i) => createFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    rename: (i) => renameFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    remove: (i) => deleteFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    join: (i) => joinFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    leave: () => leaveFn({ data: { mission_id: missionId, token: participantToken } }),
    updateState: (i) => updateStateFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    joinBroadcast: (i) => joinBcFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    leaveBroadcast: () => leaveBcFn({ data: { mission_id: missionId, token: participantToken } }),
    setRemoteBroadcast: (i) => setRemoteBcFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    joinScopeBroadcast: (i) => joinScopeFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    leaveScopeBroadcast: () => leaveScopeFn({ data: { mission_id: missionId, token: participantToken } }),
    setSquadLead: (i) => setSquadLeadFn({ data: { mission_id: missionId, token: participantToken, ...i } }),
    getSquadleadListen: () => getSquadListenFn({ data: { mission_id: missionId, token: participantToken } }),
  }), [missionId, participantToken, listFn, createFn, renameFn, deleteFn, joinFn, leaveFn, updateStateFn, setRemoteBcFn, joinBcFn, leaveBcFn, joinScopeFn, leaveScopeFn, setSquadLeadFn, getSquadListenFn]);

  return <VoicePanel adapter={adapter} selfId={participantId} canManage={isLeader} ships={ships} />;
}