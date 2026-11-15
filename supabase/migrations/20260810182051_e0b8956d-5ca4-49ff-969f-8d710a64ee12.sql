CREATE TABLE public.org_treasury_discord_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  channel_id text,
  channel_name text,
  post_deposits boolean NOT NULL DEFAULT false,
  deposits_show_name boolean NOT NULL DEFAULT true,
  post_withdrawals boolean NOT NULL DEFAULT false,
  withdrawals_show_name boolean NOT NULL DEFAULT false,
  post_monthly boolean NOT NULL DEFAULT false,
  monthly_day smallint NOT NULL DEFAULT 1,
  monthly_hour smallint NOT NULL DEFAULT 10,
  last_monthly_posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.org_treasury_discord_settings TO service_role;

ALTER TABLE public.org_treasury_discord_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages treasury discord settings"
ON public.org_treasury_discord_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER org_treasury_discord_settings_set_updated_at
BEFORE UPDATE ON public.org_treasury_discord_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();