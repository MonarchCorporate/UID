
CREATE TABLE public.ship_loadout_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ship_slug text NOT NULL,
  name text NOT NULL,
  description text,
  fleet_ship_id uuid REFERENCES public.user_ships(id) ON DELETE SET NULL,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_loadout_builds TO authenticated;
GRANT ALL ON public.ship_loadout_builds TO service_role;

ALTER TABLE public.ship_loadout_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own builds read" ON public.ship_loadout_builds
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own builds insert" ON public.ship_loadout_builds
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own builds update" ON public.ship_loadout_builds
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own builds delete" ON public.ship_loadout_builds
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX ship_loadout_builds_user_idx ON public.ship_loadout_builds(user_id);
CREATE INDEX ship_loadout_builds_ship_idx ON public.ship_loadout_builds(ship_slug);
CREATE INDEX ship_loadout_builds_token_idx ON public.ship_loadout_builds(share_token);

CREATE TRIGGER trg_ship_loadout_builds_updated
  BEFORE UPDATE ON public.ship_loadout_builds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
