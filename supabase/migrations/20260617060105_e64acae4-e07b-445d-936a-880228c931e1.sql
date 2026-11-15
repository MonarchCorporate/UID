
ALTER TABLE public.org_warehouse
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS lock_reason text;

ALTER TABLE public.org_warehouse_release_requests
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.org_warehouse(id) ON DELETE SET NULL,
  ALTER COLUMN release_id DROP NOT NULL;

ALTER TABLE public.org_warehouse_release_requests
  DROP CONSTRAINT IF EXISTS org_warehouse_release_requests_source_chk;
ALTER TABLE public.org_warehouse_release_requests
  ADD CONSTRAINT org_warehouse_release_requests_source_chk
  CHECK (release_id IS NOT NULL OR warehouse_id IS NOT NULL);
