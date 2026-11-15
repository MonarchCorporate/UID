
ALTER TABLE public.missions ALTER COLUMN password_hash DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.verify_mission_password(_mission_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.missions
    WHERE id = _mission_id
      AND (
        password_hash IS NULL
        OR password_hash = crypt(_password, password_hash)
      )
  );
$$;
