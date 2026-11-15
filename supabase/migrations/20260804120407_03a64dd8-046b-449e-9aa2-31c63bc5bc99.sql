ALTER TABLE public.discord_org_channels
  ADD COLUMN IF NOT EXISTS allow_here boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_role_mentions boolean NOT NULL DEFAULT false;

UPDATE public.discord_org_channels SET allow_here = true WHERE allow_mentions = true;