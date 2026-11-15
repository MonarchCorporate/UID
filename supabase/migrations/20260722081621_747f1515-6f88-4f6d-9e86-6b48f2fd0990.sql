
-- Extend allowed statuses
ALTER TABLE public.shop_reservations DROP CONSTRAINT IF EXISTS shop_reservations_status_check;
ALTER TABLE public.shop_reservations
  ADD CONSTRAINT shop_reservations_status_check
  CHECK (status IN ('pending','reserved','in_progress','fulfilled','cancelled'));

-- Internal notes for the org
ALTER TABLE public.shop_reservations
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- History table
CREATE TABLE IF NOT EXISTS public.shop_reservation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.shop_reservations(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_reservation_history_res_idx
  ON public.shop_reservation_history(reservation_id, created_at DESC);

GRANT SELECT, INSERT ON public.shop_reservation_history TO authenticated;
GRANT ALL ON public.shop_reservation_history TO service_role;

ALTER TABLE public.shop_reservation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse mgr reads history" ON public.shop_reservation_history;
CREATE POLICY "warehouse mgr reads history"
  ON public.shop_reservation_history FOR SELECT
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'));

DROP POLICY IF EXISTS "warehouse mgr inserts history" ON public.shop_reservation_history;
CREATE POLICY "warehouse mgr inserts history"
  ON public.shop_reservation_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'));
