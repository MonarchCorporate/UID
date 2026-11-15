CREATE TABLE public.discord_voice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  channel_id text NOT NULL,
  channel_name text,
  discord_user_id text NOT NULL,
  discord_username text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dvs_user ON public.discord_voice_sessions (discord_user_id, joined_at DESC);
CREATE INDEX idx_dvs_open ON public.discord_voice_sessions (discord_user_id) WHERE left_at IS NULL;
CREATE INDEX idx_dvs_joined ON public.discord_voice_sessions (joined_at DESC);

CREATE TABLE public.discord_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  event_type text NOT NULL,
  discord_user_id text NOT NULL,
  discord_username text,
  channel_id text,
  channel_name text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dae_created ON public.discord_activity_events (created_at DESC);
CREATE INDEX idx_dae_user ON public.discord_activity_events (discord_user_id, created_at DESC);

CREATE TABLE public.discord_bot_status (
  id text PRIMARY KEY DEFAULT 'default',
  online boolean NOT NULL DEFAULT false,
  bot_username text,
  guild_id text,
  guild_name text,
  version text,
  member_count integer,
  voice_active integer,
  last_heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.discord_bot_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  done_at timestamptz
);
CREATE INDEX idx_dbc_pending ON public.discord_bot_commands (created_at) WHERE status = 'pending';

GRANT SELECT ON public.discord_voice_sessions TO authenticated;
GRANT SELECT ON public.discord_activity_events TO authenticated;
GRANT SELECT ON public.discord_bot_status TO authenticated;
GRANT SELECT ON public.discord_bot_commands TO authenticated;
GRANT ALL ON public.discord_voice_sessions TO service_role;
GRANT ALL ON public.discord_activity_events TO service_role;
GRANT ALL ON public.discord_bot_status TO service_role;
GRANT ALL ON public.discord_bot_commands TO service_role;

ALTER TABLE public.discord_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_bot_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_bot_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read voice sessions" ON public.discord_voice_sessions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read activity events" ON public.discord_activity_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read bot status" ON public.discord_bot_status
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins read bot commands" ON public.discord_bot_commands
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.discord_bot_status (id) VALUES ('default') ON CONFLICT DO NOTHING;