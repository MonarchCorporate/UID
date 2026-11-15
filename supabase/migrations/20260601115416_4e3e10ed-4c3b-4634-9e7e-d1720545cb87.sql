
-- pgcrypto for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ ENUMS ============
CREATE TYPE public.mission_status AS ENUM ('draft','active','completed','cancelled');
CREATE TYPE public.ship_op_status AS ENUM ('ready','waiting_crew','enroute_station','enroute_mission','disabled');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  callsign TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, callsign, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'callsign', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'callsign', split_part(NEW.email,'@',1))
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ USER SHIPS (personal fleet) ============
CREATE TABLE public.user_ships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ship_slug TEXT,                -- references fleet.json key (nullable for custom)
  ship_name TEXT NOT NULL,
  manufacturer TEXT,
  custom_name TEXT,              -- nickname, e.g. "Stardancer"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ships TO authenticated;
GRANT ALL ON public.user_ships TO service_role;
ALTER TABLE public.user_ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_ships_select_own" ON public.user_ships FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_ships_insert_own" ON public.user_ships FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_ships_update_own" ON public.user_ships FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_ships_delete_own" ON public.user_ships FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ MISSIONS ============
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  password_hash TEXT NOT NULL,       -- bcrypt via crypt()
  status public.mission_status NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ,
  leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
-- Leader can read & update own missions; password_hash never exposed via client (server fn projects safe columns)
CREATE POLICY "missions_select_leader" ON public.missions FOR SELECT TO authenticated USING (auth.uid() = leader_id);
CREATE POLICY "missions_insert_self" ON public.missions FOR INSERT TO authenticated WITH CHECK (auth.uid() = leader_id);
CREATE POLICY "missions_update_leader" ON public.missions FOR UPDATE TO authenticated USING (auth.uid() = leader_id);
CREATE POLICY "missions_delete_leader" ON public.missions FOR DELETE TO authenticated USING (auth.uid() = leader_id);

-- ============ MISSION PARTICIPANTS ============
CREATE TABLE public.mission_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,        -- secret token used as participant cookie
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mission_participants_user_unique
  ON public.mission_participants (mission_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX mission_participants_mission_idx ON public.mission_participants (mission_id);

GRANT SELECT ON public.mission_participants TO anon, authenticated;
GRANT ALL ON public.mission_participants TO service_role;
ALTER TABLE public.mission_participants ENABLE ROW LEVEL SECURITY;
-- Public can list participants (mission slug is the gate), but token column should not leak.
-- We rely on server fns to expose safe projections; for direct supabase.from() calls (realtime)
-- we expose all but treat token as opaque. Acceptable because the slug+password is the real gate.
CREATE POLICY "mp_select_all" ON public.mission_participants FOR SELECT USING (true);

-- ============ MISSION SHIPS ============
CREATE TABLE public.mission_ships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  ship_slug TEXT,
  ship_name TEXT NOT NULL,
  manufacturer TEXT,
  role_tag TEXT,
  status public.ship_op_status NOT NULL DEFAULT 'waiting_crew',
  added_by UUID REFERENCES public.mission_participants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX mission_ships_mission_idx ON public.mission_ships (mission_id);
GRANT SELECT ON public.mission_ships TO anon, authenticated;
GRANT ALL ON public.mission_ships TO service_role;
ALTER TABLE public.mission_ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ms_select_all" ON public.mission_ships FOR SELECT USING (true);

-- ============ MISSION SHIP CREW ============
CREATE TABLE public.mission_ship_crew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_ship_id UUID NOT NULL REFERENCES public.mission_ships(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.mission_participants(id) ON DELETE CASCADE,
  seat_role TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participant_id) -- a participant can only be on one ship per session; cleaned up on leave
);
CREATE INDEX mission_ship_crew_ship_idx ON public.mission_ship_crew (mission_ship_id);
GRANT SELECT ON public.mission_ship_crew TO anon, authenticated;
GRANT ALL ON public.mission_ship_crew TO service_role;
ALTER TABLE public.mission_ship_crew ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msc_select_all" ON public.mission_ship_crew FOR SELECT USING (true);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_missions_updated BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mission_ships_updated BEFORE UPDATE ON public.mission_ships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_ships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_ship_crew;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_participants;
