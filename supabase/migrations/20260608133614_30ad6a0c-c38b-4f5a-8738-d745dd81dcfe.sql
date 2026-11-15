
-- ============== INVENTORY LOCATIONS ==============
CREATE TABLE public.inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','org')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_locations TO authenticated;
GRANT ALL ON public.inventory_locations TO service_role;
ALTER TABLE public.inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loc read" ON public.inventory_locations FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'org');
CREATE POLICY "loc write own" ON public.inventory_locations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "loc update own" ON public.inventory_locations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "loc delete own" ON public.inventory_locations FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ============== UEX ITEM CATALOG (shared cache) ==============
CREATE TABLE public.inventory_item_catalog (
  item_ref text PRIMARY KEY,
  name text NOT NULL,
  kind text,
  weight numeric,
  image_url text,
  source text NOT NULL DEFAULT 'uex',
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_item_catalog TO authenticated;
GRANT ALL ON public.inventory_item_catalog TO service_role;
ALTER TABLE public.inventory_item_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog read" ON public.inventory_item_catalog FOR SELECT TO authenticated USING (true);

-- ============== INVENTORY ITEMS ==============
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_ref text,
  item_name text NOT NULL,
  item_kind text,
  qty numeric NOT NULL DEFAULT 0 CHECK (qty >= 0),
  qty_reserved numeric NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
  quality integer CHECK (quality IS NULL OR (quality >= 0 AND quality <= 100)),
  location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','org')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_items_owner_idx ON public.inventory_items(owner_id);
CREATE INDEX inventory_items_ref_idx ON public.inventory_items(item_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv read" ON public.inventory_items FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'org');
CREATE POLICY "inv insert" ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "inv update" ON public.inventory_items FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "inv delete" ON public.inventory_items FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ============== MISSIONS CATALOG (shared cache) ==============
CREATE TABLE public.missions_catalog (
  mission_ref text PRIMARY KEY,
  name text NOT NULL,
  faction text,
  rank text,
  payout numeric,
  reputation text,
  location text,
  url text,
  source text NOT NULL DEFAULT 'scmdb',
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.missions_catalog TO authenticated;
GRANT ALL ON public.missions_catalog TO service_role;
ALTER TABLE public.missions_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "missions read" ON public.missions_catalog FOR SELECT TO authenticated USING (true);

-- ============== BLUEPRINTS ==============
CREATE TABLE public.blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_ref text,
  item_name text NOT NULL,
  output_qty numeric NOT NULL DEFAULT 1 CHECK (output_qty > 0),
  source_mission_ref text REFERENCES public.missions_catalog(mission_ref) ON DELETE SET NULL,
  source_url text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','org')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX blueprints_owner_idx ON public.blueprints(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprints TO authenticated;
GRANT ALL ON public.blueprints TO service_role;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp read" ON public.blueprints FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'org');
CREATE POLICY "bp insert" ON public.blueprints FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "bp update" ON public.blueprints FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "bp delete" ON public.blueprints FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ============== BLUEPRINT COMPONENTS ==============
CREATE TABLE public.blueprint_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  slot_label text NOT NULL,
  item_ref text,
  item_name text NOT NULL,
  qty numeric NOT NULL DEFAULT 1 CHECK (qty > 0),
  weight numeric NOT NULL DEFAULT 1 CHECK (weight >= 0),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bpc_bp_idx ON public.blueprint_components(blueprint_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blueprint_components TO authenticated;
GRANT ALL ON public.blueprint_components TO service_role;
ALTER TABLE public.blueprint_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpc read" ON public.blueprint_components FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.blueprints b
                 WHERE b.id = blueprint_id
                   AND (b.owner_id = auth.uid() OR b.visibility = 'org')));
CREATE POLICY "bpc write" ON public.blueprint_components FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.blueprints b WHERE b.id = blueprint_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blueprints b WHERE b.id = blueprint_id AND b.owner_id = auth.uid()));

-- ============== CRAFT HISTORY ==============
CREATE TABLE public.craft_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL,
  blueprint_name text NOT NULL,
  output_qty numeric NOT NULL,
  output_quality numeric,
  components_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  consumed_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX craft_history_user_idx ON public.craft_history(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.craft_history TO authenticated;
GRANT ALL ON public.craft_history TO service_role;
ALTER TABLE public.craft_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ch read" ON public.craft_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ch insert" ON public.craft_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "ch delete" ON public.craft_history FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============== updated_at triggers ==============
CREATE TRIGGER trg_inv_loc_updated BEFORE UPDATE ON public.inventory_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inv_items_updated BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bp_updated BEFORE UPDATE ON public.blueprints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
