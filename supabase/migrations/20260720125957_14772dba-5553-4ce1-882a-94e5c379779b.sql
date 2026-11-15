ALTER TABLE public.ship_bespoke_components ADD COLUMN IF NOT EXISTS port_name text;
ALTER TABLE public.ship_bespoke_components ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'scunpacked_non_editable';
CREATE INDEX IF NOT EXISTS ship_bespoke_components_item_ref_idx ON public.ship_bespoke_components(item_ref);
UPDATE public.ship_components_catalog SET is_bespoke = false, bespoke_reason = NULL WHERE is_bespoke = true;