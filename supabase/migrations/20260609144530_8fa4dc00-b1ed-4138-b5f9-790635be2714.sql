
-- Helper: is the given user a board member of the given session?
CREATE OR REPLACE FUNCTION public.is_board_member(_user uuid, _session uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE session_id = _session AND user_id = _user
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_board_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_board_member(uuid, uuid) TO authenticated, service_role;

-- Helper: is the given user a participant of the given mission?
CREATE OR REPLACE FUNCTION public.is_mission_participant(_user uuid, _mission uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_participants
    WHERE mission_id = _mission AND user_id = _user
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_mission_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_mission_participant(uuid, uuid) TO authenticated, service_role;

-- board_sessions: allow commander OR joined member to read
DROP POLICY IF EXISTS "bs_select_commander" ON public.board_sessions;
CREATE POLICY "bs_select_commander_or_member"
  ON public.board_sessions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = commander_id
    OR public.is_board_member(auth.uid(), id)
  );

-- board_members: restrict reads to commander / fellow members (was public; leaked tokens)
DROP POLICY IF EXISTS "bm_select_all" ON public.board_members;
CREATE POLICY "bm_select_member_or_commander"
  ON public.board_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_board_member(auth.uid(), session_id)
    OR EXISTS (
      SELECT 1 FROM public.board_sessions s
      WHERE s.id = board_members.session_id AND s.commander_id = auth.uid()
    )
  );

-- board_stations: restrict to commander / members
DROP POLICY IF EXISTS "bst_select_all" ON public.board_stations;
CREATE POLICY "bst_select_member_or_commander"
  ON public.board_stations
  FOR SELECT
  TO authenticated
  USING (
    public.is_board_member(auth.uid(), session_id)
    OR EXISTS (
      SELECT 1 FROM public.board_sessions s
      WHERE s.id = board_stations.session_id AND s.commander_id = auth.uid()
    )
  );

-- board_cargo: restrict to commander / members
DROP POLICY IF EXISTS "bc_select_all" ON public.board_cargo;
CREATE POLICY "bc_select_member_or_commander"
  ON public.board_cargo
  FOR SELECT
  TO authenticated
  USING (
    public.is_board_member(auth.uid(), session_id)
    OR EXISTS (
      SELECT 1 FROM public.board_sessions s
      WHERE s.id = board_cargo.session_id AND s.commander_id = auth.uid()
    )
  );

-- mission_participants: restrict reads to leader / fellow participants (was public; leaked tokens)
DROP POLICY IF EXISTS "mp_select_all" ON public.mission_participants;
CREATE POLICY "mp_select_participant_or_leader"
  ON public.mission_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_mission_participant(auth.uid(), mission_id)
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = mission_participants.mission_id AND m.leader_id = auth.uid()
    )
  );

-- Realtime: block anonymous channel subscriptions entirely.
-- Postgres-changes events still respect the per-table SELECT policies above,
-- which is what scopes board/mission updates to the right people.
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
