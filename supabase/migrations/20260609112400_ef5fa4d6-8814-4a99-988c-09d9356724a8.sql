
-- ============ enums ============
CREATE TYPE public.org_role AS ENUM ('member','quartermaster','treasurer','officer','owner');
CREATE TYPE public.org_treasury_kind AS ENUM ('deposit','withdraw','expense','adjust');
CREATE TYPE public.org_claim_status AS ENUM ('pending','claimed','cancelled');

-- ============ orgs ============
CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tag text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orgs TO authenticated;
GRANT ALL ON public.orgs TO service_role;
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- ============ org_members ============
CREATE TABLE public.org_members (
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- ============ helper functions (SECURITY DEFINER, no recursion) ============
CREATE OR REPLACE FUNCTION public.is_org_member(_user uuid, _org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _org AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user uuid, _org uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org AND user_id = _user AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.orgs_handle_new()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.org_members(org_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER orgs_after_insert
AFTER INSERT ON public.orgs
FOR EACH ROW EXECUTE FUNCTION public.orgs_handle_new();

CREATE TRIGGER orgs_set_updated_at
BEFORE UPDATE ON public.orgs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ orgs RLS ============
CREATE POLICY "orgs: members read"   ON public.orgs FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "orgs: anyone insert"  ON public.orgs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "orgs: owner update"   ON public.orgs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "orgs: owner delete"   ON public.orgs FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- ============ org_members RLS ============
CREATE POLICY "members: read same org" ON public.org_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members: owner/officer manage" ON public.org_members FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer']::public.org_role[]));
CREATE POLICY "members: leave self" ON public.org_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============ org_warehouse ============
CREATE TABLE public.org_warehouse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  item_ref text,
  item_name text NOT NULL,
  item_kind text,
  qty numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs',
  quality int,
  notes text,
  deposited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deposited_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_warehouse_org_idx ON public.org_warehouse(org_id);
CREATE INDEX org_warehouse_ref_idx ON public.org_warehouse(org_id, item_ref);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_warehouse TO authenticated;
GRANT ALL ON public.org_warehouse TO service_role;
ALTER TABLE public.org_warehouse ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER org_warehouse_set_updated_at
BEFORE UPDATE ON public.org_warehouse
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "warehouse: members read" ON public.org_warehouse FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "warehouse: quartermaster write" ON public.org_warehouse FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::public.org_role[]));

-- ============ org_warehouse_claims ============
CREATE TABLE public.org_warehouse_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_ref text,
  item_name text NOT NULL,
  item_kind text,
  qty numeric NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  quality int,
  notes text,
  status public.org_claim_status NOT NULL DEFAULT 'pending',
  offered_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offered_at timestamptz NOT NULL DEFAULT now(),
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX claims_org_status_idx ON public.org_warehouse_claims(org_id, status);
CREATE INDEX claims_user_idx ON public.org_warehouse_claims(offered_by);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_warehouse_claims TO authenticated;
GRANT ALL ON public.org_warehouse_claims TO service_role;
ALTER TABLE public.org_warehouse_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claims: members read" ON public.org_warehouse_claims FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "claims: user inserts own" ON public.org_warehouse_claims FOR INSERT TO authenticated
  WITH CHECK (offered_by = auth.uid() AND public.is_org_member(auth.uid(), org_id));
CREATE POLICY "claims: user cancels own pending" ON public.org_warehouse_claims FOR UPDATE TO authenticated
  USING (offered_by = auth.uid() AND status = 'pending')
  WITH CHECK (offered_by = auth.uid());
CREATE POLICY "claims: quartermaster updates" ON public.org_warehouse_claims FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','quartermaster']::public.org_role[]));

-- ============ org_treasury_entries ============
CREATE TABLE public.org_treasury_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind public.org_treasury_kind NOT NULL,
  amount_auec numeric NOT NULL,
  player_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description text,
  category text,
  booked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  booked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX treasury_org_date_idx ON public.org_treasury_entries(org_id, booked_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_treasury_entries TO authenticated;
GRANT ALL ON public.org_treasury_entries TO service_role;
ALTER TABLE public.org_treasury_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treasury: members read" ON public.org_treasury_entries FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "treasury: treasurer write" ON public.org_treasury_entries FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','treasurer']::public.org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','officer','treasurer']::public.org_role[]));

-- ============ inventory_items: offer markers ============
ALTER TABLE public.inventory_items
  ADD COLUMN offered_to_org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  ADD COLUMN offered_qty numeric;
CREATE INDEX inventory_items_offered_idx ON public.inventory_items(offered_to_org_id);
