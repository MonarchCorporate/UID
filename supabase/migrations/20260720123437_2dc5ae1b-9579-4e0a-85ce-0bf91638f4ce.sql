
CREATE TABLE public.ship_bespoke_components (
  ship_slug TEXT NOT NULL,
  class_name TEXT NOT NULL,
  item_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ship_slug, item_ref)
);
CREATE INDEX ship_bespoke_components_item_ref_idx ON public.ship_bespoke_components (item_ref);
CREATE INDEX ship_bespoke_components_ship_slug_idx ON public.ship_bespoke_components (ship_slug);

GRANT SELECT ON public.ship_bespoke_components TO authenticated, anon;
GRANT ALL ON public.ship_bespoke_components TO service_role;

ALTER TABLE public.ship_bespoke_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bespoke mappings are public read"
  ON public.ship_bespoke_components
  FOR SELECT
  USING (true);
