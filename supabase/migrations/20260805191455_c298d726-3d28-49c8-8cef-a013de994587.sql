CREATE TABLE public.discord_managed_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  discord_role_id text NOT NULL UNIQUE,
  name text NOT NULL,
  color integer NOT NULL DEFAULT 0,
  hoist boolean NOT NULL DEFAULT false,
  mentionable boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX discord_managed_roles_org_idx ON public.discord_managed_roles(org_id);

GRANT SELECT ON public.discord_managed_roles TO authenticated;
GRANT ALL ON public.discord_managed_roles TO service_role;

ALTER TABLE public.discord_managed_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their managed roles"
ON public.discord_managed_roles
FOR SELECT
TO authenticated
USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER discord_managed_roles_set_updated_at
BEFORE UPDATE ON public.discord_managed_roles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();