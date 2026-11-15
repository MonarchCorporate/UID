import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { VoicePanel, type VoiceAdapter } from "./VoicePanel";
import {
  createBoardVoiceChannel,
  deleteBoardVoiceChannel,
  joinBoardVoiceChannel,
  leaveBoardVoiceChannel,
  listBoardVoiceChannels,
  renameBoardVoiceChannel,
  updateBoardVoiceState,
  setBoardMemberBroadcast,
  joinBoardBroadcastRoom,
  leaveBoardBroadcastRoom,
  updateBoardVoiceChannelSettings,
} from "@/lib/board-voice.functions";

type Props = {
  sessionId: string;
  token: string;
  memberId: string;
  isCommander: boolean;
};

export function BoardVoicePanel({ sessionId, token, memberId, isCommander }: Props) {
  const listFn = useServerFn(listBoardVoiceChannels);
  const createFn = useServerFn(createBoardVoiceChannel);
  const renameFn = useServerFn(renameBoardVoiceChannel);
  const deleteFn = useServerFn(deleteBoardVoiceChannel);
  const joinFn = useServerFn(joinBoardVoiceChannel);
  const leaveFn = useServerFn(leaveBoardVoiceChannel);
  const updateStateFn = useServerFn(updateBoardVoiceState);
  const setRemoteBcFn = useServerFn(setBoardMemberBroadcast);
  const joinBcFn = useServerFn(joinBoardBroadcastRoom);
  const leaveBcFn = useServerFn(leaveBoardBroadcastRoom);
  const updateSettingsFn = useServerFn(updateBoardVoiceChannelSettings);

  const adapter: VoiceAdapter = useMemo(() => ({
    scopeKey: `board:${sessionId}`,
    realtime: [
      { table: "board_voice_channels", filter: `session_id=eq.${sessionId}` },
      { table: "board_voice_presence", filter: `session_id=eq.${sessionId}` },
    ],
    list: () => listFn({ data: { session_id: sessionId, token } }),
    create: (i) => createFn({ data: { session_id: sessionId, token, ...i } }),
    rename: (i) => renameFn({ data: { session_id: sessionId, token, ...i } }),
    remove: (i) => deleteFn({ data: { session_id: sessionId, token, ...i } }),
    join: (i) => joinFn({ data: { session_id: sessionId, token, ...i } }),
    leave: () => leaveFn({ data: { session_id: sessionId, token } }),
    updateState: (i) => updateStateFn({ data: { session_id: sessionId, token, ...i } }),
    joinBroadcast: (i) => joinBcFn({ data: { session_id: sessionId, token, ...i } }),
    leaveBroadcast: () => leaveBcFn({ data: { session_id: sessionId, token } }),
    updateSettings: (i) => updateSettingsFn({ data: { session_id: sessionId, token, ...i } }),
    setRemoteBroadcast: (i) => setRemoteBcFn({ data: { session_id: sessionId, token, target_member_id: i.target_participant_id, on: i.on } }),
  }), [sessionId, token, listFn, createFn, renameFn, deleteFn, joinFn, leaveFn, updateStateFn, setRemoteBcFn, joinBcFn, leaveBcFn, updateSettingsFn]);

  return <VoicePanel adapter={adapter} selfId={memberId} canManage={isCommander} />;
}