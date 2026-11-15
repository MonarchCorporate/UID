
CREATE TABLE public.org_treasury_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('deposit','withdraw')),
  amount_auec numeric NOT NULL CHECK (amount_auec > 0),
  player_id uuid NOT NULL,
  reason text,
  category text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  resulting_entry_id uuid REFERENCES public.org_treasury_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_treasury_requests_org_status ON public.org_treasury_requests(org_id, status, created_at DESC);
CREATE INDEX idx_org_treasury_requests_player ON public.org_treasury_requests(player_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.org_treasury_requests TO authenticated;
GRANT ALL ON public.org_treasury_requests TO service_role;

ALTER TABLE public.org_treasury_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own, treasurers read all"
  ON public.org_treasury_requests
  FOR SELECT
  TO authenticated
  USING (
    (player_id = auth.uid() AND public.is_org_member(auth.uid(), org_id))
    OR public.has_org_perm(auth.uid(), org_id, 'treasury.manage')
  );

CREATE POLICY "members insert own request"
  ON public.org_treasury_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = auth.uid()
    AND status = 'pending'
    AND public.is_org_member(auth.uid(), org_id)
  );

CREATE POLICY "author cancels, treasurer reviews"
  ON public.org_treasury_requests
  FOR UPDATE
  TO authenticated
  USING (
    (player_id = auth.uid() AND status = 'pending')
    OR public.has_org_perm(auth.uid(), org_id, 'treasury.manage')
  )
  WITH CHECK (
    (player_id = auth.uid() AND status IN ('pending','cancelled'))
    OR public.has_org_perm(auth.uid(), org_id, 'treasury.manage')
  );

CREATE TRIGGER trg_org_treasury_requests_updated_at
  BEFORE UPDATE ON public.org_treasury_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
