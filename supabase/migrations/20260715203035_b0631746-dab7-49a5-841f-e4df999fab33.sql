
CREATE TABLE public.orga_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_ref TEXT,
  item_name TEXT NOT NULL,
  item_kind TEXT,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  notes TEXT,
  blueprint_id UUID REFERENCES public.blueprints(id) ON DELETE SET NULL,
  resolve_deep BOOLEAN NOT NULL DEFAULT false,
  analysis_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_min_quality NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','fulfilled','rejected','cancelled')),
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orga_orders_org_status_idx ON public.orga_orders (org_id, status);
CREATE INDEX orga_orders_requested_by_idx ON public.orga_orders (requested_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orga_orders TO authenticated;
GRANT ALL ON public.orga_orders TO service_role;

ALTER TABLE public.orga_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orga_orders: members read"
  ON public.orga_orders FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "orga_orders: members create own"
  ON public.orga_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), org_id)
    AND requested_by = auth.uid()
  );

CREATE POLICY "orga_orders: requester cancel pending"
  ON public.orga_orders FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid() AND status IN ('pending','cancelled'));

CREATE POLICY "orga_orders: qm decide"
  ON public.orga_orders FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::org_role[]));

CREATE TRIGGER trg_orga_orders_updated
  BEFORE UPDATE ON public.orga_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
