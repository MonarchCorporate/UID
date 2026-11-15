
-- mission_ships
DROP POLICY IF EXISTS "ms_select_all" ON public.mission_ships;
CREATE POLICY "ms_select_leader_or_participant" ON public.mission_ships
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_ships.mission_id AND m.leader_id = auth.uid())
    OR public.is_mission_participant(auth.uid(), mission_ships.mission_id)
  );
REVOKE SELECT ON public.mission_ships FROM anon;

-- mission_ship_crew
DROP POLICY IF EXISTS "msc_select_all" ON public.mission_ship_crew;
CREATE POLICY "msc_select_leader_or_participant" ON public.mission_ship_crew
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_ships ms
      JOIN public.missions m ON m.id = ms.mission_id
      WHERE ms.id = mission_ship_crew.mission_ship_id
        AND (m.leader_id = auth.uid() OR public.is_mission_participant(auth.uid(), m.id))
    )
  );
REVOKE SELECT ON public.mission_ship_crew FROM anon;

-- mission_categories
DROP POLICY IF EXISTS "categories readable by all" ON public.mission_categories;
CREATE POLICY "categories readable by org members" ON public.mission_categories
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
REVOKE SELECT ON public.mission_categories FROM anon;

-- blueprints
DROP POLICY IF EXISTS "bp read" ON public.blueprints;
CREATE POLICY "bp read" ON public.blueprints
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (visibility = 'org' AND public.shares_org_with(auth.uid(), owner_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
