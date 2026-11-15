ALTER TABLE public.ship_catalog
  ADD COLUMN IF NOT EXISTS default_loadout jsonb NOT NULL DEFAULT '[]'::jsonb;