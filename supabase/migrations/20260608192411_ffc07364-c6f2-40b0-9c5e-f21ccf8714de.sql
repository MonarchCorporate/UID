
-- Add unit column to blueprint_components, inventory_items, inventory_item_catalog.
ALTER TABLE public.blueprint_components ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';
ALTER TABLE public.inventory_item_catalog ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'pcs';

-- Constraints
ALTER TABLE public.blueprint_components DROP CONSTRAINT IF EXISTS blueprint_components_unit_check;
ALTER TABLE public.blueprint_components ADD CONSTRAINT blueprint_components_unit_check CHECK (unit IN ('pcs','scu'));
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_unit_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_unit_check CHECK (unit IN ('pcs','scu'));
ALTER TABLE public.inventory_item_catalog DROP CONSTRAINT IF EXISTS inventory_item_catalog_unit_check;
ALTER TABLE public.inventory_item_catalog ADD CONSTRAINT inventory_item_catalog_unit_check CHECK (unit IN ('pcs','scu'));

-- Backfill blueprint_components: resource / has quantity_scu -> scu, sonst pcs.
UPDATE public.blueprint_components
  SET unit = 'scu'
  WHERE kind = 'resource' OR quantity_scu IS NOT NULL;

-- Backfill catalog: Commodities -> scu.
UPDATE public.inventory_item_catalog
  SET unit = 'scu'
  WHERE lower(kind) = 'commodities';

-- Backfill inventory_items via catalog match on item_ref.
UPDATE public.inventory_items i
  SET unit = c.unit
  FROM public.inventory_item_catalog c
  WHERE i.item_ref IS NOT NULL AND i.item_ref = c.item_ref AND c.unit <> i.unit;
