ALTER TABLE public.user_ships
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS notes text;