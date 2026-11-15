ALTER TABLE public.inventory_item_catalog
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS acquisition jsonb,
  ADD COLUMN IF NOT EXISTS shops jsonb,
  ADD COLUMN IF NOT EXISTS sources_fetched_at timestamptz;