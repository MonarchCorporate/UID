CREATE TABLE public.ship_catalog (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  manufacturer_code TEXT,
  classification TEXT,
  classification_label TEXT,
  focus TEXT,
  size TEXT,
  size_label TEXT,
  production_status TEXT,
  description TEXT,
  length_m NUMERIC,
  beam_m NUMERIC,
  height_m NUMERIC,
  mass_kg NUMERIC,
  cargo_scu NUMERIC,
  crew_min INTEGER,
  crew_max INTEGER,
  scm_speed NUMERIC,
  max_speed NUMERIC,
  pitch_rate NUMERIC,
  yaw_rate NUMERIC,
  roll_rate NUMERIC,
  hydrogen_fuel NUMERIC,
  quantum_fuel NUMERIC,
  price_uec NUMERIC,
  pledge_price_usd NUMERIC,
  store_url TEXT,
  fleetyards_url TEXT,
  hero_image TEXT,
  store_image TEXT,
  front_view TEXT,
  side_view TEXT,
  top_view TEXT,
  angled_view TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  hardpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ship_catalog TO anon, authenticated;
GRANT ALL ON public.ship_catalog TO service_role;

ALTER TABLE public.ship_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY ship_catalog_public_read ON public.ship_catalog
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY ship_catalog_admin_write ON public.ship_catalog
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER ship_catalog_set_updated_at
  BEFORE UPDATE ON public.ship_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ship_catalog_manufacturer ON public.ship_catalog(manufacturer_code);
CREATE INDEX idx_ship_catalog_classification ON public.ship_catalog(classification);