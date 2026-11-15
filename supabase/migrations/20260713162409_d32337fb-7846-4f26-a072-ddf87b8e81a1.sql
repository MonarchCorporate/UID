
CREATE TABLE public.mission_ship_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_ship_id uuid NOT NULL REFERENCES public.mission_ships(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  label text NOT NULL,
  hardpoint_name text,
  category text NOT NULL DEFAULT 'seat',
  sort_order integer NOT NULL DEFAULT 0,
  is_manual boolean NOT NULL DEFAULT false,
  assigned_participant_id uuid REFERENCES public.mission_participants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mission_ship_stations_ship_idx ON public.mission_ship_stations(mission_ship_id);
CREATE UNIQUE INDEX mission_ship_stations_assign_uniq
  ON public.mission_ship_stations(assigned_participant_id)
  WHERE assigned_participant_id IS NOT NULL;

GRANT SELECT ON public.mission_ship_stations TO authenticated;
GRANT ALL ON public.mission_ship_stations TO service_role;

ALTER TABLE public.mission_ship_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mss_select_leader_or_participant"
ON public.mission_ship_stations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.mission_ships ms
    JOIN public.missions m ON m.id = ms.mission_id
    WHERE ms.id = mission_ship_stations.mission_ship_id
      AND (m.leader_id = auth.uid() OR public.is_mission_participant(auth.uid(), m.id))
  )
);
