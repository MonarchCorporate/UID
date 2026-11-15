
ALTER TABLE public.missions
  ADD COLUMN show_in_calendar boolean NOT NULL DEFAULT true,
  ADD COLUMN show_participant_count boolean NOT NULL DEFAULT true;
