
ALTER TABLE public.mission_voice_channels
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES public.mission_voice_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_group_parent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_broadcast boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS mission_voice_channels_parent_idx
  ON public.mission_voice_channels(parent_id);

ALTER TABLE public.board_voice_channels
  ADD COLUMN IF NOT EXISTS parent_id uuid NULL REFERENCES public.board_voice_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_group_parent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_broadcast boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS board_voice_channels_parent_idx
  ON public.board_voice_channels(parent_id);

ALTER TABLE public.mission_voice_presence
  ADD COLUMN IF NOT EXISTS is_broadcasting boolean NOT NULL DEFAULT false;

ALTER TABLE public.board_voice_presence
  ADD COLUMN IF NOT EXISTS is_broadcasting boolean NOT NULL DEFAULT false;
