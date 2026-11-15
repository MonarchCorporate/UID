CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  source_item_id uuid,
  item_ref text,
  item_name text NOT NULL,
  item_kind text,
  qty numeric NOT NULL CHECK (qty > 0),
  unit text NOT NULL DEFAULT 'pcs',
  quality numeric,
  note text,
  status text NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_transfers TO authenticated;
GRANT ALL ON public.inventory_transfers TO service_role;

ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their transfers"
  ON public.inventory_transfers FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE INDEX idx_inventory_transfers_to ON public.inventory_transfers (to_user_id, status);
CREATE INDEX idx_inventory_transfers_from ON public.inventory_transfers (from_user_id, status);

CREATE TRIGGER inventory_transfers_set_updated_at
  BEFORE UPDATE ON public.inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();