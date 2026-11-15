
CREATE TABLE public.board_voice_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.board_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'group' CHECK (kind IN ('command','ship','group')),
  created_by UUID REFERENCES public.board_members(id) ON DELETE SET NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX board_voice_channels_session_idx ON public.board_voice_channels(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_voice_channels TO authenticated;
GRANT ALL ON public.board_voice_channels TO service_role;
ALTER TABLE public.board_voice_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board voice channels: members read"
  ON public.board_voice_channels FOR SELECT TO authenticated
  USING (public.is_board_member(auth.uid(), session_id));

CREATE TABLE public.board_voice_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.board_sessions(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.board_voice_channels(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.board_members(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT NOT NULL,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_deafened BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX board_voice_presence_channel_idx ON public.board_voice_presence(channel_id);
CREATE INDEX board_voice_presence_session_idx ON public.board_voice_presence(session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_voice_presence TO authenticated;
GRANT ALL ON public.board_voice_presence TO service_role;
ALTER TABLE public.board_voice_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board voice presence: members read"
  ON public.board_voice_presence FOR SELECT TO authenticated
  USING (public.is_board_member(auth.uid(), session_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.board_voice_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.board_voice_presence;
