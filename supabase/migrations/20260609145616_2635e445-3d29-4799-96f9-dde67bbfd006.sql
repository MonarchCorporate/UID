
-- Helper: do two users share at least one org?
CREATE OR REPLACE FUNCTION public.shares_org_with(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members a
    JOIN public.org_members b ON a.org_id = b.org_id
    WHERE a.user_id = _a AND b.user_id = _b
  );
$$;
REVOKE EXECUTE ON FUNCTION public.shares_org_with(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_org_with(uuid, uuid) TO authenticated, service_role;

-- Blueprints: org visibility requires shared org membership
DROP POLICY IF EXISTS "bp read" ON public.blueprints;
CREATE POLICY "bp read" ON public.blueprints
  FOR SELECT TO authenticated
  USING (
    source <> 'manual'
    OR owner_id = auth.uid()
    OR (visibility = 'org' AND public.shares_org_with(auth.uid(), owner_id))
  );

-- Inventory items: org visibility requires shared org membership
DROP POLICY IF EXISTS "inv read" ON public.inventory_items;
CREATE POLICY "inv read" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (visibility = 'org' AND public.shares_org_with(auth.uid(), owner_id))
  );

-- Inventory locations: same tightening
DROP POLICY IF EXISTS "loc read" ON public.inventory_locations;
CREATE POLICY "loc read" ON public.inventory_locations
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (visibility = 'org' AND public.shares_org_with(auth.uid(), owner_id))
  );

-- Realtime: scope topic subscription to board/mission membership
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON realtime.messages;
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
      AND public.is_mission_participant(
        auth.uid(),
        NULLIF(substring(realtime.topic() from 9), '')::uuid
      )
    )
  );

-- Ship-images bucket: remove anon read; keep authenticated read
DROP POLICY IF EXISTS "ship_images_public_read" ON storage.objects;
CREATE POLICY "ship_images_authenticated_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'ship-images');

-- Re-revoke public execute on password helpers (CREATE OR REPLACE re-grants defaults)
REVOKE EXECUTE ON FUNCTION public.crypt_password(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crypt_password(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.verify_mission_password(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mission_password(uuid, text) TO service_role;

-- Document fleet_sync_runs intent: service-role only, no API access
COMMENT ON TABLE public.fleet_sync_runs IS
  'Service-role only. RLS enabled with no policies — intentionally inaccessible to anon/authenticated via PostgREST. Writes occur from server-side admin code only.';
