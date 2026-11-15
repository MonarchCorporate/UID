
CREATE TABLE public.org_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_custom_roles TO authenticated;
GRANT ALL ON public.org_custom_roles TO service_role;

ALTER TABLE public.org_custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view custom roles"
  ON public.org_custom_roles FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "managers can insert custom roles"
  ON public.org_custom_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(auth.uid(), org_id, ARRAY['owner']::org_role[])
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "managers can update custom roles"
  ON public.org_custom_roles FOR UPDATE TO authenticated
  USING (
    public.has_org_role(auth.uid(), org_id, ARRAY['owner']::org_role[])
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "managers can delete custom roles"
  ON public.org_custom_roles FOR DELETE TO authenticated
  USING (
    public.has_org_role(auth.uid(), org_id, ARRAY['owner']::org_role[])
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER org_custom_roles_updated_at
  BEFORE UPDATE ON public.org_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.org_members
  ADD COLUMN custom_role_id uuid REFERENCES public.org_custom_roles(id) ON DELETE SET NULL;

CREATE INDEX org_members_custom_role_idx ON public.org_members(custom_role_id);
