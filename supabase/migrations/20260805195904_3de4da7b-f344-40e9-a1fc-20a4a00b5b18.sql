
CREATE TABLE public.rsi_verification_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rsi_verification_codes TO authenticated;
GRANT ALL ON public.rsi_verification_codes TO service_role;

ALTER TABLE public.rsi_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rsi code read"
ON public.rsi_verification_codes FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER rsi_verification_codes_set_updated_at
BEFORE UPDATE ON public.rsi_verification_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.rsi_verification_codes (user_id, code, expires_at)
SELECT id, rsi_verify_code, COALESCE(rsi_verify_code_expires_at, now())
FROM public.profiles
WHERE rsi_verify_code IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles
  DROP COLUMN rsi_verify_code,
  DROP COLUMN rsi_verify_code_expires_at;
