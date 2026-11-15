CREATE TABLE public.giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  prize text NOT NULL DEFAULT '',
  org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  points_per_voice_minute numeric NOT NULL DEFAULT 1,
  points_per_message numeric NOT NULL DEFAULT 2,
  points_per_reaction numeric NOT NULL DEFAULT 1,
  points_per_ticket numeric NOT NULL DEFAULT 60,
  max_tickets integer NOT NULL DEFAULT 50,
  min_points numeric NOT NULL DEFAULT 0,
  min_voice_session_seconds integer NOT NULL DEFAULT 60,
  daily_message_cap integer NOT NULL DEFAULT 200,
  daily_reaction_cap integer NOT NULL DEFAULT 200,
  winner_count integer NOT NULL DEFAULT 1,
  announce_channel_id text,
  announced_message_id text,
  status text NOT NULL DEFAULT 'draft',
  drawn_at timestamptz,
  draw_seed text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id text,
  voice_seconds integer NOT NULL DEFAULT 0,
  messages integer NOT NULL DEFAULT 0,
  reactions integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 0,
  tickets integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, user_id)
);

CREATE TABLE public.giveaway_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place integer NOT NULL DEFAULT 1,
  tickets integer NOT NULL DEFAULT 0,
  total_tickets integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, user_id)
);

GRANT SELECT ON public.giveaways TO authenticated;
GRANT ALL ON public.giveaways TO service_role;
GRANT SELECT ON public.giveaway_entries TO authenticated;
GRANT ALL ON public.giveaway_entries TO service_role;
GRANT SELECT ON public.giveaway_winners TO authenticated;
GRANT ALL ON public.giveaway_winners TO service_role;

ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "giveaways_read" ON public.giveaways
  FOR SELECT TO authenticated
  USING (status <> 'draft' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "giveaway_entries_read" ON public.giveaway_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "giveaway_winners_read" ON public.giveaway_winners
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER giveaways_set_updated_at
  BEFORE UPDATE ON public.giveaways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_activity_events_user_time
  ON public.discord_activity_events (discord_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_events_type_time
  ON public.discord_activity_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_user_time
  ON public.discord_voice_sessions (discord_user_id, joined_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_reaction_event
  ON public.discord_activity_events (discord_user_id, (meta->>'message_id'), (meta->>'emoji'))
  WHERE event_type = 'reaction';