DROP POLICY IF EXISTS app_settings_public_read ON public.app_settings;
REVOKE SELECT ON public.app_settings FROM anon;
CREATE POLICY app_settings_admin_read ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, callsign, display_name, avatar_url, status_text, created_at, updated_at, discord_username)
  ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;