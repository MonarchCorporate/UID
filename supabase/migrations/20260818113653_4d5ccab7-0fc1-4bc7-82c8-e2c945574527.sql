-- 1) Giveaway winners: scope reads
DROP POLICY IF EXISTS giveaway_winners_read ON public.giveaway_winners;
CREATE POLICY giveaway_winners_read ON public.giveaway_winners
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.giveaways g
    WHERE g.id = giveaway_winners.giveaway_id
      AND (
        g.org_id IS NULL
        OR public.is_org_member(auth.uid(), g.org_id)
      )
  )
);

-- 2) Marketplace images: scope reads to listing visibility
DROP POLICY IF EXISTS "mp images read auth" ON storage.objects;
CREATE POLICY "mp images read scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'marketplace-images'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.marketplace_listings l
      WHERE (
          l.image_urls @> ARRAY[storage.objects.name]
          OR EXISTS (
            SELECT 1 FROM unnest(l.image_urls) u
            WHERE u LIKE '%' || storage.objects.name
          )
        )
        AND (
          l.created_by = auth.uid()
          OR l.scope = 'allianz'::marketplace_scope
          OR l.org_id IS NULL
          OR public.is_org_member(auth.uid(), l.org_id)
        )
    )
  )
);