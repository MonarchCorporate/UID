-- =====================================================================
-- Admin role system
-- =====================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "user_roles_select_own_or_admin"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_manage"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =====================================================================
-- Loadout templates (admin-default and per-user overrides)
-- =====================================================================
CREATE TABLE public.ship_loadout_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('admin', 'user')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ship_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slt_scope_user_consistency CHECK (
    (scope = 'admin' AND user_id IS NULL) OR (scope = 'user' AND user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX slt_admin_unique ON public.ship_loadout_templates (ship_slug)
  WHERE scope = 'admin';
CREATE UNIQUE INDEX slt_user_unique ON public.ship_loadout_templates (user_id, ship_slug)
  WHERE scope = 'user';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_loadout_templates TO authenticated;
GRANT ALL ON public.ship_loadout_templates TO service_role;

ALTER TABLE public.ship_loadout_templates ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated may read templates (needed for seed previews)
CREATE POLICY "slt_select_all_authenticated"
  ON public.ship_loadout_templates FOR SELECT TO authenticated
  USING (true);

-- Admin templates: only admins
CREATE POLICY "slt_admin_insert"
  ON public.ship_loadout_templates FOR INSERT TO authenticated
  WITH CHECK (scope = 'admin' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "slt_admin_update"
  ON public.ship_loadout_templates FOR UPDATE TO authenticated
  USING (scope = 'admin' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (scope = 'admin' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "slt_admin_delete"
  ON public.ship_loadout_templates FOR DELETE TO authenticated
  USING (scope = 'admin' AND public.has_role(auth.uid(), 'admin'));

-- User templates: owner who actually has the ship in user_ships
CREATE POLICY "slt_user_insert_own_owned"
  ON public.ship_loadout_templates FOR INSERT TO authenticated
  WITH CHECK (
    scope = 'user'
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_ships us
      WHERE us.user_id = auth.uid() AND us.ship_slug = ship_loadout_templates.ship_slug
    )
  );

CREATE POLICY "slt_user_update_own"
  ON public.ship_loadout_templates FOR UPDATE TO authenticated
  USING (scope = 'user' AND user_id = auth.uid())
  WITH CHECK (scope = 'user' AND user_id = auth.uid());

CREATE POLICY "slt_user_delete_own"
  ON public.ship_loadout_templates FOR DELETE TO authenticated
  USING (scope = 'user' AND user_id = auth.uid());

CREATE TRIGGER slt_set_updated_at
  BEFORE UPDATE ON public.ship_loadout_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- Loadout stations (individual seats inside a template)
-- =====================================================================
CREATE TABLE public.ship_loadout_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.ship_loadout_templates(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  label text NOT NULL,
  hardpoint_name text,
  category text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sls_template_idx ON public.ship_loadout_stations (template_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_loadout_stations TO authenticated;
GRANT ALL ON public.ship_loadout_stations TO service_role;

ALTER TABLE public.ship_loadout_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sls_select_all_authenticated"
  ON public.ship_loadout_stations FOR SELECT TO authenticated
  USING (true);

-- Helper: writeable if user owns the parent template (admin via has_role, user via own row)
CREATE OR REPLACE FUNCTION public.can_write_loadout_template(_template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ship_loadout_templates t
    WHERE t.id = _template_id
      AND (
        (t.scope = 'admin' AND public.has_role(auth.uid(), 'admin'))
        OR (t.scope = 'user' AND t.user_id = auth.uid())
      )
  )
$$;

CREATE POLICY "sls_write_via_template"
  ON public.ship_loadout_stations FOR ALL TO authenticated
  USING (public.can_write_loadout_template(template_id))
  WITH CHECK (public.can_write_loadout_template(template_id));
