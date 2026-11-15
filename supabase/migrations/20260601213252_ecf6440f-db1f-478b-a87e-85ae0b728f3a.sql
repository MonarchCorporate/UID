
-- Enums
CREATE TYPE public.board_session_status AS ENUM ('standby','in_flight','docked');
CREATE TYPE public.board_cargo_status AS ENUM ('loaded','unloaded','lost');

-- Sessions
CREATE TABLE public.board_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  commander_id uuid NOT NULL,
  ship_slug text,
  ship_name text NOT NULL,
  custom_name text,
  status public.board_session_status NOT NULL DEFAULT 'standby',
  cargo_cap_scu integer,
  crew_cap integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_sessions TO authenticated;
GRANT ALL ON public.board_sessions TO service_role;
ALTER TABLE public.board_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bs_select_commander" ON public.board_sessions FOR SELECT TO authenticated USING (auth.uid() = commander_id);
CREATE POLICY "bs_insert_self" ON public.board_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = commander_id);
CREATE POLICY "bs_update_commander" ON public.board_sessions FOR UPDATE TO authenticated USING (auth.uid() = commander_id);
CREATE POLICY "bs_delete_commander" ON public.board_sessions FOR DELETE TO authenticated USING (auth.uid() = commander_id);

CREATE TRIGGER trg_bs_updated BEFORE UPDATE ON public.board_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Members
CREATE TABLE public.board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.board_sessions(id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL,
  token text NOT NULL,
  is_commander boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bm_session ON public.board_members(session_id);
GRANT SELECT ON public.board_members TO authenticated, anon;
GRANT ALL ON public.board_members TO service_role;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bm_select_all" ON public.board_members FOR SELECT TO public USING (true);

-- Stations
CREATE TABLE public.board_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.board_sessions(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  label text NOT NULL,
  hardpoint_name text,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  assigned_member_id uuid REFERENCES public.board_members(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bst_session ON public.board_stations(session_id);
GRANT SELECT ON public.board_stations TO authenticated, anon;
GRANT ALL ON public.board_stations TO service_role;
ALTER TABLE public.board_stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bst_select_all" ON public.board_stations FOR SELECT TO public USING (true);

-- Cargo
CREATE TABLE public.board_cargo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.board_sessions(id) ON DELETE CASCADE,
  commodity text NOT NULL,
  scu numeric(10,2) NOT NULL DEFAULT 0,
  status public.board_cargo_status NOT NULL DEFAULT 'loaded',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bc_session ON public.board_cargo(session_id);
GRANT SELECT ON public.board_cargo TO authenticated, anon;
GRANT ALL ON public.board_cargo TO service_role;
ALTER TABLE public.board_cargo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bc_select_all" ON public.board_cargo FOR SELECT TO public USING (true);

CREATE TRIGGER trg_bc_updated BEFORE UPDATE ON public.board_cargo
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_stations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_cargo;
