
CREATE TABLE public.orga_order_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orga_orders(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES public.org_warehouse(id) ON DELETE SET NULL,
  item_ref TEXT,
  item_name TEXT NOT NULL,
  item_kind TEXT,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orga_order_reservations_org_ref_idx
  ON public.orga_order_reservations (org_id, item_ref);
CREATE INDEX orga_order_reservations_org_name_idx
  ON public.orga_order_reservations (org_id, lower(item_name));
CREATE INDEX orga_order_reservations_order_idx
  ON public.orga_order_reservations (order_id);

GRANT SELECT ON public.orga_order_reservations TO authenticated;
GRANT ALL ON public.orga_order_reservations TO service_role;

ALTER TABLE public.orga_order_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view reservations"
  ON public.orga_order_reservations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
