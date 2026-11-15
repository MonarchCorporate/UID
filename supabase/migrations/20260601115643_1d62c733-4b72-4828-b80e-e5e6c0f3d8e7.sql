
-- Hash a password (bcrypt) — callable by authenticated users (only used by leader create flow via service role anyway)
CREATE OR REPLACE FUNCTION public.crypt_password(pwd TEXT)
RETURNS TABLE(hash TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT crypt(pwd, gen_salt('bf', 10));
$$;
REVOKE EXECUTE ON FUNCTION public.crypt_password(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crypt_password(TEXT) TO service_role;

-- Verify a mission password
CREATE OR REPLACE FUNCTION public.verify_mission_password(_mission_id UUID, _password TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.missions
    WHERE id = _mission_id
      AND password_hash = crypt(_password, password_hash)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.verify_mission_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_mission_password(UUID, TEXT) TO service_role;
