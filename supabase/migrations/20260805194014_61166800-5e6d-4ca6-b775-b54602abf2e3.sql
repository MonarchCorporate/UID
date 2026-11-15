ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS rsi_sid text;
CREATE UNIQUE INDEX IF NOT EXISTS orgs_rsi_sid_unique ON public.orgs (upper(rsi_sid)) WHERE rsi_sid IS NOT NULL;