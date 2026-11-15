DROP POLICY "claims update participants" ON public.marketplace_claims;
CREATE POLICY "claims update participants" ON public.marketplace_claims
FOR UPDATE TO authenticated
USING ((auth.uid() = claimed_by) OR (EXISTS (SELECT 1 FROM marketplace_listings l WHERE l.id = marketplace_claims.listing_id AND l.created_by = auth.uid())) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (((auth.uid() = claimed_by) OR (EXISTS (SELECT 1 FROM marketplace_listings l WHERE l.id = marketplace_claims.listing_id AND l.created_by = auth.uid())) OR has_role(auth.uid(), 'admin'::app_role))
 AND (listing_id = (SELECT c.listing_id FROM marketplace_claims c WHERE c.id = marketplace_claims.id))
 AND (claimed_by = (SELECT c.claimed_by FROM marketplace_claims c WHERE c.id = marketplace_claims.id)));

DROP POLICY "claims: user cancels own pending" ON public.org_warehouse_claims;
CREATE POLICY "claims: user cancels own pending" ON public.org_warehouse_claims
FOR UPDATE TO authenticated
USING ((offered_by = auth.uid()) AND (status = 'pending'::org_claim_status))
WITH CHECK ((offered_by = auth.uid()) AND (status = 'cancelled'::org_claim_status)
 AND (org_id = (SELECT c.org_id FROM org_warehouse_claims c WHERE c.id = org_warehouse_claims.id))
 AND (offered_by = (SELECT c.offered_by FROM org_warehouse_claims c WHERE c.id = org_warehouse_claims.id)));