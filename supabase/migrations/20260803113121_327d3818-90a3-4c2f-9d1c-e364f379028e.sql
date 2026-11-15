DO $$ BEGIN
  CREATE TYPE public.marketplace_scope AS ENUM ('intern','allianz');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS scope public.marketplace_scope NOT NULL DEFAULT 'allianz',
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS marketplace_listings_scope_org_idx
  ON public.marketplace_listings (scope, org_id);

DROP POLICY IF EXISTS "listings read all auth" ON public.marketplace_listings;

CREATE POLICY "listings read scoped" ON public.marketplace_listings
FOR SELECT TO authenticated
USING (
  auth.uid() = created_by
  OR scope = 'allianz'
  OR org_id IS NULL
  OR public.is_org_member(auth.uid(), org_id)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);