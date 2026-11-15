ALTER TABLE public.discord_role_mappings
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS discord_role_mappings_one_lead_per_org
  ON public.discord_role_mappings (org_id)
  WHERE is_lead;