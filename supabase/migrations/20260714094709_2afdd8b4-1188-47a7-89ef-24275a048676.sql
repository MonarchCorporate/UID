
-- Squad lead flag + broadcast scope for mission voice
ALTER TABLE public.mission_participants
  ADD COLUMN IF NOT EXISTS is_squad_lead boolean NOT NULL DEFAULT false;

ALTER TABLE public.mission_voice_presence
  ADD COLUMN IF NOT EXISTS broadcast_scope text;

ALTER TABLE public.mission_voice_presence
  DROP CONSTRAINT IF EXISTS mission_voice_presence_broadcast_scope_check;
ALTER TABLE public.mission_voice_presence
  ADD CONSTRAINT mission_voice_presence_broadcast_scope_check
  CHECK (broadcast_scope IS NULL OR broadcast_scope IN ('ship','mission','squadleads'));

-- Backfill: previous ship-wide flag maps to scope='ship'
UPDATE public.mission_voice_presence
   SET broadcast_scope = 'ship'
 WHERE is_broadcasting = true AND broadcast_scope IS NULL;

-- Board equivalents
ALTER TABLE public.board_members
  ADD COLUMN IF NOT EXISTS is_squad_lead boolean NOT NULL DEFAULT false;

ALTER TABLE public.board_voice_presence
  ADD COLUMN IF NOT EXISTS broadcast_scope text;

ALTER TABLE public.board_voice_presence
  DROP CONSTRAINT IF EXISTS board_voice_presence_broadcast_scope_check;
ALTER TABLE public.board_voice_presence
  ADD CONSTRAINT board_voice_presence_broadcast_scope_check
  CHECK (broadcast_scope IS NULL OR broadcast_scope IN ('ship','mission','squadleads'));

UPDATE public.board_voice_presence
   SET broadcast_scope = 'ship'
 WHERE is_broadcasting = true AND broadcast_scope IS NULL;

-- Optional mission-level allow flags
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS allow_mission_broadcast boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_squadlead_broadcast boolean NOT NULL DEFAULT true;
