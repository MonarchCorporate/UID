CREATE TABLE public.discord_reaction_role_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL,
  channel_name text,
  message_id text,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  color integer,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discord_reaction_role_panels TO authenticated;
GRANT ALL ON public.discord_reaction_role_panels TO service_role;

ALTER TABLE public.discord_reaction_role_panels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage reaction role panels"
ON public.discord_reaction_role_panels FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_reaction_role_panels_message ON public.discord_reaction_role_panels (message_id);

CREATE TRIGGER discord_reaction_role_panels_set_updated_at
BEFORE UPDATE ON public.discord_reaction_role_panels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();