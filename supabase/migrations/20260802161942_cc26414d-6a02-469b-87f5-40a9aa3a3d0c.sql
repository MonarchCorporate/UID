ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS fleet_source text NOT NULL DEFAULT 'members',
  ADD COLUMN IF NOT EXISTS fleetyards_slug text;

ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_fleet_source_chk;
ALTER TABLE public.orgs ADD CONSTRAINT orgs_fleet_source_chk CHECK (fleet_source IN ('members','fleetyards'));

CREATE TABLE IF NOT EXISTS public.org_fleet_ships (
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  manufacturer text,
  manufacturer_code text,
  classification text,
  focus text,
  size text,
  length text,
  crew text,
  cargo text,
  image text,
  store_url text,
  count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, slug)
);

GRANT SELECT ON public.org_fleet_ships TO authenticated;
GRANT ALL ON public.org_fleet_ships TO service_role;

ALTER TABLE public.org_fleet_ships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read fleet" ON public.org_fleet_ships;
CREATE POLICY "org members read fleet"
  ON public.org_fleet_ships
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = org_fleet_ships.org_id AND m.user_id = auth.uid()
  ));