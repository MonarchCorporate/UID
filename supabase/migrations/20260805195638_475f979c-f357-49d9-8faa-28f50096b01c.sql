
-- 1) discord_role_mappings: org scoped
DROP POLICY IF EXISTS "Authenticated can read discord mappings" ON public.discord_role_mappings;
CREATE POLICY "Org members read discord mappings"
ON public.discord_role_mappings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_org_member(auth.uid(), org_id));

-- 2) marketplace_claims
DROP POLICY IF EXISTS "claims read auth" ON public.marketplace_claims;
CREATE POLICY "claims read participants"
ON public.marketplace_claims FOR SELECT TO authenticated
USING (
  auth.uid() = claimed_by
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = marketplace_claims.listing_id AND l.created_by = auth.uid())
);

-- 3) marketplace_messages
DROP POLICY IF EXISTS "msg read auth" ON public.marketplace_messages;
CREATE POLICY "msg read participants"
ON public.marketplace_messages FOR SELECT TO authenticated
USING (
  auth.uid() = author_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = marketplace_messages.listing_id AND l.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.marketplace_claims c WHERE c.listing_id = marketplace_messages.listing_id AND c.claimed_by = auth.uid())
);

-- 4) profiles
DROP POLICY IF EXISTS "profiles_read_authenticated" ON public.profiles;
CREATE POLICY "profiles_read_scoped"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.shares_org_with(auth.uid(), id)
);
