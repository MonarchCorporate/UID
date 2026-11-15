
-- Tighten marketplace_claims UPDATE: prevent reassigning listing_id or claimed_by
DROP POLICY IF EXISTS "claims update participants" ON public.marketplace_claims;
CREATE POLICY "claims update participants"
ON public.marketplace_claims
FOR UPDATE
USING (
  (auth.uid() = claimed_by)
  OR EXISTS (
    SELECT 1 FROM public.marketplace_listings l
    WHERE l.id = marketplace_claims.listing_id AND l.created_by = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (
    (auth.uid() = claimed_by)
    OR EXISTS (
      SELECT 1 FROM public.marketplace_listings l
      WHERE l.id = marketplace_claims.listing_id AND l.created_by = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  AND listing_id = (SELECT listing_id FROM public.marketplace_claims c WHERE c.id = marketplace_claims.id)
  AND claimed_by = (SELECT claimed_by FROM public.marketplace_claims c WHERE c.id = marketplace_claims.id)
);

-- Tighten org_warehouse_claims: users can only cancel their own pending claim
DROP POLICY IF EXISTS "claims: user cancels own pending" ON public.org_warehouse_claims;
CREATE POLICY "claims: user cancels own pending"
ON public.org_warehouse_claims
FOR UPDATE
USING (
  offered_by = auth.uid() AND status = 'pending'::org_claim_status
)
WITH CHECK (
  offered_by = auth.uid()
  AND status = 'cancelled'::org_claim_status
  AND org_id = (SELECT org_id FROM public.org_warehouse_claims c WHERE c.id = org_warehouse_claims.id)
  AND offered_by = (SELECT offered_by FROM public.org_warehouse_claims c WHERE c.id = org_warehouse_claims.id)
);
