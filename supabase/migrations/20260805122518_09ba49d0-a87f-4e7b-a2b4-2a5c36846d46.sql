CREATE TABLE public.org_blueprint_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  source_mode text NOT NULL DEFAULT 'all',
  allowed_roles text[] NOT NULL DEFAULT '{}',
  allowed_custom_role_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_blueprint_settings_mode_chk CHECK (source_mode IN ('all','roles'))
);

GRANT SELECT ON public.org_blueprint_settings TO authenticated;
GRANT ALL ON public.org_blueprint_settings TO service_role;

ALTER TABLE public.org_blueprint_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read blueprint settings"
ON public.org_blueprint_settings
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER org_blueprint_settings_set_updated_at
BEFORE UPDATE ON public.org_blueprint_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();