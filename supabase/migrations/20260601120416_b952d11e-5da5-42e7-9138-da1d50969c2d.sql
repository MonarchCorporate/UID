CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.fleet_ships (
  slug text PRIMARY KEY,
  name text NOT NULL,
  manufacturer text,
  manufacturer_code text,
  classification text,
  focus text,
  size text,
  length text,
  crew text,
  cargo text,
  image text,
  store_url text,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fleet_ships TO anon, authenticated;
GRANT ALL ON public.fleet_ships TO service_role;

ALTER TABLE public.fleet_ships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet_ships_public_read" ON public.fleet_ships
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.fleet_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  ship_count integer,
  error_message text
);

GRANT ALL ON public.fleet_sync_runs TO service_role;

ALTER TABLE public.fleet_sync_runs ENABLE ROW LEVEL SECURITY;
