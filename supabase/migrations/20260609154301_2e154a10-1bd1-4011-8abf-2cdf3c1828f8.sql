DROP POLICY IF EXISTS "Scoped realtime subscriptions" ON realtime.messages;
CREATE POLICY "Scoped realtime subscriptions"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (
      realtime.topic() LIKE 'board-%'
      AND public.is_board_member(
        auth.uid(),
        NULLIF(substring(realtime.topic() from 7), '')::uuid
      )
    )
    OR (
      realtime.topic() LIKE 'mission:%'
      AND (
        public.is_mission_participant(
          auth.uid(),
          NULLIF(substring(realtime.topic() from 9), '')::uuid
        )
        OR EXISTS (
          SELECT 1 FROM public.missions m
          WHERE m.id = NULLIF(substring(realtime.topic() from 9), '')::uuid
            AND m.leader_id = auth.uid()
        )
      )
    )
  );