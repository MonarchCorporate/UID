ALTER TABLE public.discord_managed_channels
  ADD COLUMN IF NOT EXISTS visible_role_ids text[] NOT NULL DEFAULT '{}'::text[];