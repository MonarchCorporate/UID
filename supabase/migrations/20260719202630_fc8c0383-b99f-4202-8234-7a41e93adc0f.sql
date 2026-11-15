
ALTER TABLE public.org_warehouse
  ADD COLUMN IF NOT EXISTS held_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS held_at timestamptz;

CREATE INDEX IF NOT EXISTS org_warehouse_held_by_idx
  ON public.org_warehouse(held_by)
  WHERE held_by IS NOT NULL;
