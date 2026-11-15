-- Multi-Tenant SaaS: Slug, Branding, is_active für Orgas
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.orgs
SET slug = 'monarch',
    branding = jsonb_build_object(
      'primary', '#f5b301',
      'accent', '#3b82f6',
      'logo_url', null,
      'hero_title', 'United Imperial Dominion',
      'hero_subtitle', 'Backoffice für unsere Star-Citizen-Orga',
      'about_md', '',
      'show_fleet', true,
      'show_calendar', true,
      'show_shop', true
    )
WHERE slug IS NULL
  AND id = (SELECT id FROM public.orgs ORDER BY created_at ASC LIMIT 1);

UPDATE public.orgs
SET slug = regexp_replace(lower(coalesce(tag, name, id::text)), '[^a-z0-9-]+', '-', 'g')
WHERE slug IS NULL;

ALTER TABLE public.orgs
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.orgs
  DROP CONSTRAINT IF EXISTS orgs_slug_format_chk;
ALTER TABLE public.orgs
  ADD CONSTRAINT orgs_slug_format_chk
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,31}$');

CREATE UNIQUE INDEX IF NOT EXISTS orgs_slug_key ON public.orgs (slug);

CREATE OR REPLACE FUNCTION public.org_id_from_slug(_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.orgs WHERE slug = _slug AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member_by_slug(_slug text, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members m
    JOIN public.orgs o ON o.id = m.org_id
    WHERE o.slug = _slug
      AND o.is_active = true
      AND m.user_id = _user
  );
$$;

DROP POLICY IF EXISTS "Orgs sind öffentlich lesbar" ON public.orgs;
CREATE POLICY "Orgs sind öffentlich lesbar"
  ON public.orgs
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

GRANT SELECT ON public.orgs TO anon;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, callsign, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'callsign', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'callsign', split_part(NEW.email,'@',1))
  );
  RETURN NEW;
END;
$function$;

-- Storage-Policies für org-branding Bucket (Bucket wurde separat angelegt)
DROP POLICY IF EXISTS "Org branding public read" ON storage.objects;
CREATE POLICY "Org branding public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'org-branding');

DROP POLICY IF EXISTS "Org branding admin write" ON storage.objects;
CREATE POLICY "Org branding admin write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org-branding' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Org branding admin update" ON storage.objects;
CREATE POLICY "Org branding admin update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'org-branding' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Org branding admin delete" ON storage.objects;
CREATE POLICY "Org branding admin delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'org-branding' AND public.has_role(auth.uid(), 'admin'::app_role));