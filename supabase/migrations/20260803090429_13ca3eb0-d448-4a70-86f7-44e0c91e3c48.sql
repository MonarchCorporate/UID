ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS discord_user_id text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS discord_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_discord_user_id_key
  ON public.profiles (discord_user_id) WHERE discord_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.discord_role_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_role_id text NOT NULL,
  discord_role_name text NOT NULL,
  discord_role_color integer NOT NULL DEFAULT 0,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discord_role_id, org_id)
);

GRANT SELECT ON public.discord_role_mappings TO authenticated;
GRANT ALL ON public.discord_role_mappings TO service_role;
ALTER TABLE public.discord_role_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read discord mappings"
  ON public.discord_role_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "App admins manage discord mappings"
  ON public.discord_role_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.discord_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  remove_on_role_loss boolean NOT NULL DEFAULT false,
  last_full_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.discord_settings TO authenticated;
GRANT ALL ON public.discord_settings TO service_role;
ALTER TABLE public.discord_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read discord settings"
  ON public.discord_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "App admins manage discord settings"
  ON public.discord_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.discord_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_discord_role_mappings_updated_at
  BEFORE UPDATE ON public.discord_role_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_discord_settings_updated_at
  BEFORE UPDATE ON public.discord_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();