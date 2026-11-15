
CREATE TABLE public.mission_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#888888',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT ON public.mission_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_categories TO authenticated;
GRANT ALL ON public.mission_categories TO service_role;

ALTER TABLE public.mission_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories readable by all"
  ON public.mission_categories FOR SELECT
  USING (true);

CREATE POLICY "officers can insert categories"
  ON public.mission_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['officer','owner']::org_role[]));

CREATE POLICY "officers can update categories"
  ON public.mission_categories FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['officer','owner']::org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['officer','owner']::org_role[]));

CREATE POLICY "officers can delete categories"
  ON public.mission_categories FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['officer','owner']::org_role[]));

CREATE TRIGGER mission_categories_set_updated_at
  BEFORE UPDATE ON public.mission_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.missions
  ADD COLUMN category_id uuid REFERENCES public.mission_categories(id) ON DELETE SET NULL;

CREATE INDEX missions_category_id_idx ON public.missions(category_id);
CREATE INDEX missions_starts_at_idx ON public.missions(starts_at);
