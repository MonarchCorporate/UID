
ALTER TABLE public.blueprint_missions
  ADD COLUMN IF NOT EXISTS min_standing_name text,
  ADD COLUMN IF NOT EXISTS min_reputation numeric,
  ADD COLUMN IF NOT EXISTS max_standing_name text,
  ADD COLUMN IF NOT EXISTS max_reputation numeric,
  ADD COLUMN IF NOT EXISTS reward_scope text,
  ADD COLUMN IF NOT EXISTS web_url text,
  ADD COLUMN IF NOT EXISTS star_systems text[],
  ADD COLUMN IF NOT EXISTS legality_label text;
