CREATE TABLE public.giveaway_optins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, discord_user_id)
);

GRANT SELECT ON public.giveaway_optins TO authenticated;
GRANT ALL ON public.giveaway_optins TO service_role;

ALTER TABLE public.giveaway_optins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own giveaway signup"
ON public.giveaway_optins FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_giveaway_optins_giveaway ON public.giveaway_optins(giveaway_id);