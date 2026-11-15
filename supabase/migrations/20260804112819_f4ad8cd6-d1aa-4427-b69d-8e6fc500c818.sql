CREATE TABLE public.discord_org_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text NOT NULL,
  allow_mentions boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, channel_id)
);

GRANT SELECT ON public.discord_org_channels TO authenticated;
GRANT ALL ON public.discord_org_channels TO service_role;
ALTER TABLE public.discord_org_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their discord channels"
ON public.discord_org_channels FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER discord_org_channels_set_updated_at
BEFORE UPDATE ON public.discord_org_channels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.discord_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  channel_name text,
  message_id text,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'message',
  title text,
  posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.discord_posts TO authenticated;
GRANT ALL ON public.discord_posts TO service_role;
ALTER TABLE public.discord_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their discord posts"
ON public.discord_posts FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), org_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER discord_posts_set_updated_at
BEFORE UPDATE ON public.discord_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_discord_posts_org ON public.discord_posts(org_id, created_at DESC);