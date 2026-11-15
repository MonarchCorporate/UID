ALTER TABLE public.inventory_locations ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.inventory_locations
  ADD CONSTRAINT inventory_locations_owner_or_org_chk
  CHECK (owner_id IS NOT NULL OR visibility = 'org');