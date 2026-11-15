CREATE TABLE public.discord_org_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  category_name text NOT NULL,
  can_create boolean NOT NULL DEFAULT true,
  can_rename boolean NOT NULL DEFAULT true,
  can_delete boolean NOT NULL DEFAULT false,
  max_channels integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, category_id)
);

GRANT SELECT ON public.discord_org_categories TO authenticated;
GRANT ALL ON public.discord_org_categories TO service_role;
ALTER TABLE public.discord_org_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read their category releases"
ON public.discord_org_categories FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER discord_org_categories_set_updated_at
BEFORE UPDATE ON public.discord_org_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.discord_managed_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  category_id text NOT NULL,
  channel_id text NOT NULL UNIQUE,
  channel_name text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.discord_managed_channels TO authenticated;
GRANT ALL ON public.discord_managed_channels TO service_role;
ALTER TABLE public.discord_managed_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read their managed channels"
ON public.discord_managed_channels FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER discord_managed_channels_set_updated_at
BEFORE UPDATE ON public.discord_managed_channels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_discord_managed_channels_org ON public.discord_managed_channels(org_id);