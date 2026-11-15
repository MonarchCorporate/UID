-- Add granular permissions to org members
ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';

-- Backfill sensible presets from existing role (idempotent)
UPDATE public.org_members SET permissions = CASE role
  WHEN 'owner' THEN ARRAY['orders.view','orders.review','warehouse.requests.review','warehouse.manage','treasury.manage','members.manage']
  WHEN 'officer' THEN ARRAY['orders.view','orders.review','warehouse.requests.review','warehouse.manage','treasury.manage','members.manage']
  WHEN 'quartermaster' THEN ARRAY['orders.view','orders.review','warehouse.requests.review','warehouse.manage']
  WHEN 'treasurer' THEN ARRAY['orders.view','treasury.manage']
  ELSE ARRAY[]::text[]
END
WHERE permissions = '{}' OR permissions IS NULL;

-- SECURITY DEFINER helper: owner or app-admin implicitly true, else explicit perm.
CREATE OR REPLACE FUNCTION public.has_org_perm(_user uuid, _org uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_id = _org AND user_id = _user
        AND (role = 'owner' OR _perm = ANY(permissions))
    )
$$;