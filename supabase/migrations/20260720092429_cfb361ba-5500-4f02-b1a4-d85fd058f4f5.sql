ALTER TABLE public.ship_components_catalog
  ADD COLUMN IF NOT EXISTS is_bespoke boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bespoke_reason text;

CREATE INDEX IF NOT EXISTS ship_components_catalog_is_bespoke_idx
  ON public.ship_components_catalog(is_bespoke) WHERE is_bespoke = true;