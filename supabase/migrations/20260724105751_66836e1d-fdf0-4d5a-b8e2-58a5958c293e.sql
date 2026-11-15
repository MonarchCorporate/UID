
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS missions_org_id_idx ON public.missions(org_id);

ALTER TABLE public.user_ships ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS user_ships_org_id_idx ON public.user_ships(org_id);
