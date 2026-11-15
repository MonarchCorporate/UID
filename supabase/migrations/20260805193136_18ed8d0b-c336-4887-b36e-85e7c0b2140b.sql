ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rsi_handle text,
  ADD COLUMN IF NOT EXISTS rsi_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsi_verify_code text,
  ADD COLUMN IF NOT EXISTS rsi_verify_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsi_verify_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsi_verify_attempt_window timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_rsi_handle_verified_key
  ON public.profiles (lower(rsi_handle))
  WHERE rsi_verified_at IS NOT NULL AND rsi_handle IS NOT NULL;