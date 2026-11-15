
ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS preset_key text;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_locations_owner_preset_uidx
  ON public.inventory_locations (owner_id, preset_key)
  WHERE preset_key IS NOT NULL;

ALTER TABLE public.org_warehouse
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_label text,
  ADD COLUMN IF NOT EXISTS location_since timestamptz;
