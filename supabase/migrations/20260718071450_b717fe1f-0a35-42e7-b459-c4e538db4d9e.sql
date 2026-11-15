CREATE INDEX IF NOT EXISTS inventory_items_owner_ref_idx ON public.inventory_items (owner_id, item_ref) WHERE item_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_warehouse_org_ref_idx ON public.org_warehouse (org_id, item_ref) WHERE item_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ship_components_catalog_item_ref_idx ON public.ship_components_catalog (item_ref) WHERE item_ref IS NOT NULL;