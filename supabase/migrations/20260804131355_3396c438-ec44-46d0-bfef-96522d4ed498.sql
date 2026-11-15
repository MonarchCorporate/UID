ALTER TABLE public.discord_managed_channels
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.discord_managed_channels
  DROP CONSTRAINT IF EXISTS discord_managed_channels_visibility_check;

ALTER TABLE public.discord_managed_channels
  ADD CONSTRAINT discord_managed_channels_visibility_check
  CHECK (visibility IN ('public','private'));