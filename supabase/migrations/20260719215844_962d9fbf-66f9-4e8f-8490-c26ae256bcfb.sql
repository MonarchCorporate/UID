CREATE TABLE public.ship_stock_loadouts (
  ship_slug text PRIMARY KEY,
  class_name text NOT NULL,
  loadout jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'scunpacked',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ship_stock_loadouts TO authenticated;
GRANT SELECT ON public.ship_stock_loadouts TO anon;
GRANT ALL ON public.ship_stock_loadouts TO service_role;

ALTER TABLE public.ship_stock_loadouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock loadouts readable by anyone"
  ON public.ship_stock_loadouts FOR SELECT
  USING (true);

CREATE TRIGGER trg_ship_stock_loadouts_updated_at
  BEFORE UPDATE ON public.ship_stock_loadouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();