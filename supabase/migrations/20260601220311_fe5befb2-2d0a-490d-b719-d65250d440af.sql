ALTER TABLE public.board_sessions ADD COLUMN IF NOT EXISTS ship_meta jsonb;
ALTER TABLE public.board_stations ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false;