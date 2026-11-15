
-- Roles enum for list members
CREATE TYPE public.farm_list_role AS ENUM ('viewer', 'editor');
CREATE TYPE public.farm_list_status AS ENUM ('active', 'completed', 'archived');

-- ============================================================
-- farm_lists
-- ============================================================
CREATE TABLE public.farm_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status public.farm_list_status NOT NULL DEFAULT 'active',
  include_personal_inventory boolean NOT NULL DEFAULT true,
  include_org_warehouse boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farm_lists_owner_idx ON public.farm_lists(owner_id);
CREATE INDEX farm_lists_org_idx ON public.farm_lists(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_lists TO authenticated;
GRANT ALL ON public.farm_lists TO service_role;

ALTER TABLE public.farm_lists ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- farm_list_members
-- ============================================================
CREATE TABLE public.farm_list_members (
  list_id uuid NOT NULL REFERENCES public.farm_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.farm_list_role NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX farm_list_members_user_idx ON public.farm_list_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_list_members TO authenticated;
GRANT ALL ON public.farm_list_members TO service_role;

ALTER TABLE public.farm_list_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Security-definer helpers (avoid recursive RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_farm_list_owner(_list uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.farm_lists WHERE id = _list AND owner_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.can_access_farm_list(_list uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.farm_lists WHERE id = _list AND owner_id = _user)
    OR EXISTS (SELECT 1 FROM public.farm_list_members WHERE list_id = _list AND user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.can_edit_farm_list(_list uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.farm_lists WHERE id = _list AND owner_id = _user)
    OR EXISTS (
      SELECT 1 FROM public.farm_list_members
      WHERE list_id = _list AND user_id = _user AND role = 'editor'
    )
$$;

REVOKE EXECUTE ON FUNCTION public.is_farm_list_owner(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.can_access_farm_list(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.can_edit_farm_list(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_farm_list_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_farm_list(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_farm_list(uuid, uuid) TO authenticated;

-- Policies for farm_lists
CREATE POLICY "farm_lists read" ON public.farm_lists
  FOR SELECT TO authenticated
  USING (public.can_access_farm_list(id, auth.uid()));

CREATE POLICY "farm_lists insert own" ON public.farm_lists
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "farm_lists update own" ON public.farm_lists
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "farm_lists delete own" ON public.farm_lists
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Policies for farm_list_members
CREATE POLICY "farm_list_members read" ON public.farm_list_members
  FOR SELECT TO authenticated
  USING (public.can_access_farm_list(list_id, auth.uid()));

CREATE POLICY "farm_list_members manage by owner" ON public.farm_list_members
  FOR ALL TO authenticated
  USING (public.is_farm_list_owner(list_id, auth.uid()))
  WITH CHECK (public.is_farm_list_owner(list_id, auth.uid()));

-- ============================================================
-- farm_list_blueprints
-- ============================================================
CREATE TABLE public.farm_list_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.farm_lists(id) ON DELETE CASCADE,
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, blueprint_id)
);
CREATE INDEX farm_list_blueprints_list_idx ON public.farm_list_blueprints(list_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_list_blueprints TO authenticated;
GRANT ALL ON public.farm_list_blueprints TO service_role;

ALTER TABLE public.farm_list_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_list_blueprints read" ON public.farm_list_blueprints
  FOR SELECT TO authenticated
  USING (public.can_access_farm_list(list_id, auth.uid()));

CREATE POLICY "farm_list_blueprints write" ON public.farm_list_blueprints
  FOR ALL TO authenticated
  USING (public.can_edit_farm_list(list_id, auth.uid()))
  WITH CHECK (public.can_edit_farm_list(list_id, auth.uid()));

-- ============================================================
-- farm_list_contributions
-- ============================================================
CREATE TABLE public.farm_list_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.farm_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_ref text NOT NULL,
  material_name text NOT NULL,
  qty numeric NOT NULL CHECK (qty > 0),
  quality integer CHECK (quality IS NULL OR (quality >= 0 AND quality <= 1000)),
  note text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','inventory')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX farm_list_contrib_list_idx ON public.farm_list_contributions(list_id);
CREATE INDEX farm_list_contrib_user_idx ON public.farm_list_contributions(user_id);
CREATE INDEX farm_list_contrib_ref_idx ON public.farm_list_contributions(list_id, material_ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_list_contributions TO authenticated;
GRANT ALL ON public.farm_list_contributions TO service_role;

ALTER TABLE public.farm_list_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_list_contrib read" ON public.farm_list_contributions
  FOR SELECT TO authenticated
  USING (public.can_access_farm_list(list_id, auth.uid()));

CREATE POLICY "farm_list_contrib insert" ON public.farm_list_contributions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_edit_farm_list(list_id, auth.uid()));

CREATE POLICY "farm_list_contrib update own or owner" ON public.farm_list_contributions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_farm_list_owner(list_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_farm_list_owner(list_id, auth.uid()));

CREATE POLICY "farm_list_contrib delete own or owner" ON public.farm_list_contributions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_farm_list_owner(list_id, auth.uid()));

-- updated_at trigger for farm_lists
CREATE TRIGGER farm_lists_set_updated_at
  BEFORE UPDATE ON public.farm_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
