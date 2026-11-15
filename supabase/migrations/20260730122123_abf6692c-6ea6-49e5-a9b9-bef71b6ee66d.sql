ALTER TABLE public.ship_catalog
  ADD COLUMN IF NOT EXISTS price_uec_terminal text,
  ADD COLUMN IF NOT EXISTS price_uec_terminals jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS price_rent_uec numeric,
  ADD COLUMN IF NOT EXISTS price_source text,
  ADD COLUMN IF NOT EXISTS price_synced_at timestamptz;