
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.inventory_item_catalog
  ADD COLUMN IF NOT EXISTS price_buy numeric,
  ADD COLUMN IF NOT EXISTS price_sell numeric,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS inventory_item_catalog_name_trgm
  ON public.inventory_item_catalog USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS inventory_item_catalog_kind_idx
  ON public.inventory_item_catalog (kind);
