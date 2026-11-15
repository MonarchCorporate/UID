CREATE TABLE public.org_treasury_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'both',
  color text NOT NULL DEFAULT '#22d3ee',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX org_treasury_categories_uniq ON public.org_treasury_categories (org_id, lower(name));
CREATE INDEX org_treasury_categories_org_idx ON public.org_treasury_categories (org_id, sort_order);

GRANT SELECT ON public.org_treasury_categories TO authenticated;
GRANT ALL ON public.org_treasury_categories TO service_role;

ALTER TABLE public.org_treasury_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treasury categories: members read"
  ON public.org_treasury_categories FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER org_treasury_categories_set_updated_at
  BEFORE UPDATE ON public.org_treasury_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();