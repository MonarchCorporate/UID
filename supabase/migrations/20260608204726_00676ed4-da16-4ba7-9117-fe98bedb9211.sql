ALTER TABLE public.blueprints
  ADD COLUMN IF NOT EXISTS output_modifiers jsonb,
  ADD COLUMN IF NOT EXISTS modifiers_fetched_at timestamptz;