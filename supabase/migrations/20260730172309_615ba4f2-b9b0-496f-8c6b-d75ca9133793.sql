ALTER TABLE public.board_sessions
  ADD COLUMN IF NOT EXISTS mission_id uuid,
  ADD COLUMN IF NOT EXISTS mission_ship_id uuid;

ALTER TABLE public.mission_ships
  ADD COLUMN IF NOT EXISTS board_session_id uuid REFERENCES public.board_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_board_sessions_mission ON public.board_sessions(mission_id);
CREATE INDEX IF NOT EXISTS idx_board_sessions_mission_ship ON public.board_sessions(mission_ship_id);
CREATE INDEX IF NOT EXISTS idx_mission_ships_board_session ON public.mission_ships(board_session_id);

DROP POLICY IF EXISTS "board_sessions_select_mission_participants" ON public.board_sessions;
CREATE POLICY "board_sessions_select_mission_participants"
ON public.board_sessions FOR SELECT
TO authenticated
USING (
  mission_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.mission_participants mp
    WHERE mp.mission_id = board_sessions.mission_id
      AND mp.user_id = auth.uid()
  )
);