
-- 1. Profiles: restrict to authenticated only
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2. blueprint_components: inherit shares_org_with check from parent blueprint
DROP POLICY IF EXISTS "bpc read" ON public.blueprint_components;
CREATE POLICY "bpc read"
  ON public.blueprint_components FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.blueprints b
      WHERE b.id = blueprint_components.blueprint_id
        AND (
          b.source <> 'manual'
          OR b.owner_id = auth.uid()
          OR (b.visibility = 'org' AND public.shares_org_with(auth.uid(), b.owner_id))
        )
    )
  );

-- 3. missions: allow participants (and existing leader policy) to SELECT
CREATE POLICY "missions_select_participant"
  ON public.missions FOR SELECT
  TO authenticated
  USING (public.is_mission_participant(auth.uid(), id));

-- 4. ship-images bucket: explicit admin-only INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "ship_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "ship_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "ship_images_admin_delete" ON storage.objects;

CREATE POLICY "ship_images_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ship-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ship_images_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'ship-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'ship-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ship_images_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ship-images' AND public.has_role(auth.uid(), 'admin'));
