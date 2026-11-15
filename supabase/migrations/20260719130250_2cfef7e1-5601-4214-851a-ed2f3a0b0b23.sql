-- Clear merged_into pointers that reference UEX rows (defensive; usually merged_into points from UEX -> Wiki)
UPDATE public.inventory_item_catalog
SET merged_into = NULL
WHERE merged_into IN (SELECT item_ref FROM public.inventory_item_catalog WHERE source = 'uex');

-- Delete all UEX-sourced catalog rows (items + commodities)
DELETE FROM public.inventory_item_catalog
WHERE source = 'uex';