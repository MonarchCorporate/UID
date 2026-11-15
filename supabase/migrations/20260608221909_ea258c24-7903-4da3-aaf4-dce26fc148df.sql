CREATE TABLE public.ship_components_catalog (
  item_ref text PRIMARY KEY,
  wiki_uuid text UNIQUE NOT NULL,
  name text NOT NULL,
  slug text,
  manufacturer_name text,
  manufacturer_code text,
  classification text,
  classification_label text,
  category text NOT NULL,
  size integer,
  grade text,
  item_class text,
  type text,
  type_label text,
  sub_type text,
  sub_type_label text,
  description jsonb,
  image_url text,
  web_url text,
  shops jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_price_buy numeric,
  is_craftable boolean NOT NULL DEFAULT false,
  raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ship_components_catalog TO authenticated;
GRANT ALL ON public.ship_components_catalog TO service_role;

ALTER TABLE public.ship_components_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ship_components_read_all"
  ON public.ship_components_catalog
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX ship_components_category_idx ON public.ship_components_catalog (category);
CREATE INDEX ship_components_classification_idx ON public.ship_components_catalog (classification);
CREATE INDEX ship_components_size_idx ON public.ship_components_catalog (size);
CREATE INDEX ship_components_name_trgm ON public.ship_components_catalog USING gin (name gin_trgm_ops);

CREATE TRIGGER trg_ship_components_updated
  BEFORE UPDATE ON public.ship_components_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();