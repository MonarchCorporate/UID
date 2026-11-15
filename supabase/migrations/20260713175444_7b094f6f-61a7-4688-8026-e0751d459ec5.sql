-- Marketplace tables
CREATE TYPE marketplace_listing_type AS ENUM ('auftrag','suche','verkauf','tausch');
CREATE TYPE marketplace_listing_status AS ENUM ('offen','angenommen','in_lieferung','abgeschlossen','storniert','abgelaufen');
CREATE TYPE marketplace_claim_status AS ENUM ('angenommen','in_lieferung','geliefert','abgeschlossen','storniert');

CREATE TABLE public.marketplace_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type marketplace_listing_type NOT NULL,
  status marketplace_listing_status NOT NULL DEFAULT 'offen',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT,
  price_auec BIGINT,
  quantity NUMERIC,
  unit TEXT,
  trade_offer TEXT,
  trade_want TEXT,
  location TEXT,
  inventory_item_id UUID,
  org_warehouse_id UUID,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_listings TO authenticated;
GRANT ALL ON public.marketplace_listings TO service_role;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings read all auth" ON public.marketplace_listings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "listings insert own" ON public.marketplace_listings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "listings update own or admin" ON public.marketplace_listings
  FOR UPDATE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "listings delete own or admin" ON public.marketplace_listings
  FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER marketplace_listings_updated_at
  BEFORE UPDATE ON public.marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX marketplace_listings_status_idx ON public.marketplace_listings(status);
CREATE INDEX marketplace_listings_type_idx ON public.marketplace_listings(type);
CREATE INDEX marketplace_listings_created_by_idx ON public.marketplace_listings(created_by);

-- Claims
CREATE TABLE public.marketplace_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  claimed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status marketplace_claim_status NOT NULL DEFAULT 'angenommen',
  note TEXT,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_claims TO authenticated;
GRANT ALL ON public.marketplace_claims TO service_role;
ALTER TABLE public.marketplace_claims ENABLE ROW LEVEL SECURITY;

-- Only one active claim per listing
CREATE UNIQUE INDEX marketplace_claims_one_active
  ON public.marketplace_claims(listing_id)
  WHERE status IN ('angenommen','in_lieferung','geliefert');

CREATE POLICY "claims read auth" ON public.marketplace_claims
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "claims insert own" ON public.marketplace_claims
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = claimed_by);
CREATE POLICY "claims update participants" ON public.marketplace_claims
  FOR UPDATE TO authenticated USING (
    auth.uid() = claimed_by
    OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = listing_id AND l.created_by = auth.uid())
    OR public.has_role(auth.uid(),'admin')
  ) WITH CHECK (true);
CREATE POLICY "claims delete admin" ON public.marketplace_claims
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER marketplace_claims_updated_at
  BEFORE UPDATE ON public.marketplace_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Messages
CREATE TABLE public.marketplace_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.marketplace_messages TO authenticated;
GRANT ALL ON public.marketplace_messages TO service_role;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msg read auth" ON public.marketplace_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "msg insert own" ON public.marketplace_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "msg delete own or admin" ON public.marketplace_messages
  FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(),'admin'));

CREATE INDEX marketplace_messages_listing_idx ON public.marketplace_messages(listing_id, created_at);
