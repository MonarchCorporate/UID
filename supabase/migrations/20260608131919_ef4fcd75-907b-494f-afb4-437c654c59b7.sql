ALTER TABLE public.ship_catalog
  ADD COLUMN IF NOT EXISTS holo_url text,
  ADD COLUMN IF NOT EXISTS paints jsonb NOT NULL DEFAULT '[]'::jsonb;