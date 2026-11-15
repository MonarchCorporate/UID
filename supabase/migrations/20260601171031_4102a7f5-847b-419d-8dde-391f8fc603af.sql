ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fleetyards_username text,
  ADD COLUMN IF NOT EXISTS fleetyards_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS fleetyards_last_error text;

ALTER TABLE public.user_ships
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS user_ships_user_source_idx
  ON public.user_ships (user_id, source);