
CREATE TABLE public.mission_voice_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'group' CHECK (kind IN ('command','ship','group')),
  ship_id uuid REFERENCES public.mission_ships(id) ON DELETE CASCADE,
  created_by uuid,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_voice_channels_mission_idx ON public.mission_voice_channels(mission_id);

GRANT SELECT ON public.mission_voice_channels TO authenticated;
GRANT ALL ON public.mission_voice_channels TO service_role;
ALTER TABLE public.mission_voice_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice channels visible to mission participants"
ON public.mission_voice_channels FOR SELECT TO authenticated
USING (
  public.is_mission_participant(auth.uid(), mission_id)
  OR EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.leader_id = auth.uid())
);

CREATE TRIGGER mission_voice_channels_set_updated_at
BEFORE UPDATE ON public.mission_voice_channels
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.mission_voice_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.mission_voice_channels(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.mission_participants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  is_muted boolean NOT NULL DEFAULT false,
  is_deafened boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id)
);
CREATE INDEX mission_voice_presence_channel_idx ON public.mission_voice_presence(channel_id);
CREATE INDEX mission_voice_presence_mission_idx ON public.mission_voice_presence(mission_id);

GRANT SELECT ON public.mission_voice_presence TO authenticated;
GRANT ALL ON public.mission_voice_presence TO service_role;
ALTER TABLE public.mission_voice_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice presence visible to mission participants"
ON public.mission_voice_presence FOR SELECT TO authenticated
USING (
  public.is_mission_participant(auth.uid(), mission_id)
  OR EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.leader_id = auth.uid())
);

CREATE TRIGGER mission_voice_presence_set_updated_at
BEFORE UPDATE ON public.mission_voice_presence
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_voice_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mission_voice_presence;
