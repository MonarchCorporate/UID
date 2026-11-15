-- Extend blueprints for wiki catalog
ALTER TABLE public.blueprints
  ALTER COLUMN owner_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_uuid text,
  ADD COLUMN IF NOT EXISTS output_uuid text,
  ADD COLUMN IF NOT EXISTS craft_time_seconds integer,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS blueprints_external_uuid_uniq
  ON public.blueprints(external_uuid) WHERE external_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS blueprints_source_idx ON public.blueprints(source);

-- Extend blueprint_components
ALTER TABLE public.blueprint_components
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS external_uuid text,
  ADD COLUMN IF NOT EXISTS quantity_scu numeric;

-- Extend inventory_item_catalog for wiki UUIDs
ALTER TABLE public.inventory_item_catalog
  ADD COLUMN IF NOT EXISTS wiki_uuid text;
CREATE INDEX IF NOT EXISTS inventory_item_catalog_wiki_uuid_idx
  ON public.inventory_item_catalog(wiki_uuid) WHERE wiki_uuid IS NOT NULL;

-- Replace blueprints read policy: own/org + all wiki blueprints
DROP POLICY IF EXISTS "bp read" ON public.blueprints;
CREATE POLICY "bp read" ON public.blueprints
  FOR SELECT TO authenticated
  USING (
    source <> 'manual'
    OR owner_id = auth.uid()
    OR visibility = 'org'
  );

-- Allow component reads for any visible blueprint (wiki rows have no owner)
DROP POLICY IF EXISTS "bpc read" ON public.blueprint_components;
CREATE POLICY "bpc read" ON public.blueprint_components
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.blueprints b
    WHERE b.id = blueprint_components.blueprint_id
      AND (b.source <> 'manual' OR b.owner_id = auth.uid() OR b.visibility = 'org')
  ));

-- blueprint_missions: which missions unlock which blueprint
CREATE TABLE IF NOT EXISTS public.blueprint_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  mission_uuid text NOT NULL,
  mission_title text NOT NULL,
  mission_giver text,
  faction text,
  reward_min numeric,
  reward_max numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blueprint_id, mission_uuid)
);
GRANT SELECT ON public.blueprint_missions TO authenticated;
GRANT ALL ON public.blueprint_missions TO service_role;
ALTER TABLE public.blueprint_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bm_read ON public.blueprint_missions;
CREATE POLICY bm_read ON public.blueprint_missions
  FOR SELECT TO authenticated USING (true);

-- user_blueprint_collection: per-user owned flag
CREATE TABLE IF NOT EXISTS public.user_blueprint_collection (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blueprint_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_blueprint_collection TO authenticated;
GRANT ALL ON public.user_blueprint_collection TO service_role;
ALTER TABLE public.user_blueprint_collection ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ubc_own ON public.user_blueprint_collection;
CREATE POLICY ubc_own ON public.user_blueprint_collection
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- App settings key for last blueprint sync (read by status fn)
INSERT INTO public.app_settings (key, value)
VALUES ('wiki_blueprint_sync', '{"last_synced_at": null, "blueprints_count": 0, "missions_count": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;