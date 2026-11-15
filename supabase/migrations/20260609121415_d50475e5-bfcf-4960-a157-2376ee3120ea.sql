
CREATE TABLE public.org_warehouse_releases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  item_ref TEXT,
  item_name TEXT NOT NULL,
  item_kind TEXT,
  qty_initial NUMERIC NOT NULL CHECK (qty_initial > 0),
  qty_remaining NUMERIC NOT NULL CHECK (qty_remaining >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  quality NUMERIC,
  notes TEXT,
  released_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_warehouse_releases TO authenticated;
GRANT ALL ON public.org_warehouse_releases TO service_role;
ALTER TABLE public.org_warehouse_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view releases"
  ON public.org_warehouse_releases FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "qm can write releases"
  ON public.org_warehouse_releases FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::org_role[]));
CREATE TRIGGER trg_releases_updated BEFORE UPDATE ON public.org_warehouse_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_releases_org ON public.org_warehouse_releases(org_id, status);

CREATE TABLE public.org_warehouse_release_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES public.org_warehouse_releases(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_warehouse_release_requests TO authenticated;
GRANT ALL ON public.org_warehouse_release_requests TO service_role;
ALTER TABLE public.org_warehouse_release_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view requests"
  ON public.org_warehouse_release_requests FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members can create own request"
  ON public.org_warehouse_release_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND requested_by = auth.uid());
CREATE POLICY "owner can cancel own pending"
  ON public.org_warehouse_release_requests FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() AND status = 'pending')
  WITH CHECK (requested_by = auth.uid());
CREATE POLICY "qm can decide requests"
  ON public.org_warehouse_release_requests FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::org_role[]));
CREATE TRIGGER trg_release_requests_updated BEFORE UPDATE ON public.org_warehouse_release_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_release_requests_release ON public.org_warehouse_release_requests(release_id, status);
CREATE INDEX idx_release_requests_org ON public.org_warehouse_release_requests(org_id, status);
