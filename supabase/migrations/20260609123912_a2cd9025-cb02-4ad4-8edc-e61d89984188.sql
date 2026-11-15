
-- 1. Wipe all org data
DELETE FROM public.org_warehouse_release_requests;
DELETE FROM public.org_warehouse_releases;
DELETE FROM public.org_warehouse_claims;
DELETE FROM public.org_warehouse;
DELETE FROM public.org_treasury_entries;
DELETE FROM public.org_members;
UPDATE public.inventory_items SET offered_to_org_id = NULL, offered_qty = NULL
  WHERE offered_to_org_id IS NOT NULL OR offered_qty IS NOT NULL;
DELETE FROM public.orgs;

-- 2. Create singleton org (owner = first app admin)
INSERT INTO public.orgs (name, tag, owner_id)
SELECT 'Monarch', 'MNRC', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ORDER BY ur.created_at ASC
LIMIT 1;

-- 3. Helper to fetch the singleton org id
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.orgs ORDER BY created_at ASC LIMIT 1
$$;

-- 4. Backfill: every existing user becomes a member; admins become owner.
INSERT INTO public.org_members (org_id, user_id, role)
SELECT
  public.current_org_id(),
  u.id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin')
      THEN 'owner'::org_role
    ELSE 'member'::org_role
  END
FROM auth.users u
WHERE public.current_org_id() IS NOT NULL
ON CONFLICT (org_id, user_id) DO NOTHING;

-- 5. Extend new-user trigger to also add an org_members row
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
BEGIN
  INSERT INTO public.profiles (id, callsign, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'callsign', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'callsign', split_part(NEW.email,'@',1))
  );

  _org := public.current_org_id();
  IF _org IS NOT NULL THEN
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (_org, NEW.id, 'member'::org_role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Allow app admins to update the singleton org (replace owner-only update policy)
DROP POLICY IF EXISTS "orgs: owner update" ON public.orgs;
CREATE POLICY "orgs: owner or admin update"
ON public.orgs
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 7. Drop "create new org" capability — keep table secure: nobody creates orgs from the app anymore.
DROP POLICY IF EXISTS "orgs: anyone insert" ON public.orgs;
