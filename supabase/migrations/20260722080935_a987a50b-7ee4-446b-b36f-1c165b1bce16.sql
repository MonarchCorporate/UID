
ALTER TABLE public.org_warehouse
  ADD COLUMN IF NOT EXISTS for_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sale_price numeric,
  ADD COLUMN IF NOT EXISTS sale_note text,
  ADD COLUMN IF NOT EXISTS reserved_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz;

CREATE TABLE public.shop_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.org_warehouse(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  item_ref text,
  item_name text NOT NULL,
  qty numeric NOT NULL CHECK (qty > 0),
  unit text NOT NULL DEFAULT 'pcs',
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  buyer_ingame_name text NOT NULL,
  buyer_discord_name text NOT NULL,
  buyer_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','cancelled')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shop_reservations_org_status_idx
  ON public.shop_reservations (org_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_reservations TO authenticated;
GRANT ALL ON public.shop_reservations TO service_role;

ALTER TABLE public.shop_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse managers see shop reservations"
  ON public.shop_reservations FOR SELECT
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'));

CREATE POLICY "warehouse managers update shop reservations"
  ON public.shop_reservations FOR UPDATE
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'))
  WITH CHECK (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'));

CREATE POLICY "warehouse managers delete shop reservations"
  ON public.shop_reservations FOR DELETE
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'));

CREATE TRIGGER set_shop_reservations_updated_at
  BEFORE UPDATE ON public.shop_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_shop_reservation(
  _warehouse_id uuid,
  _qty numeric,
  _buyer_ingame text,
  _buyer_discord text,
  _buyer_note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _w record;
  _available numeric;
  _res_id uuid;
  _ingame text;
  _discord text;
  _note text;
BEGIN
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Ungültige Menge.';
  END IF;
  _ingame := btrim(coalesce(_buyer_ingame, ''));
  _discord := btrim(coalesce(_buyer_discord, ''));
  _note := nullif(btrim(coalesce(_buyer_note, '')), '');
  IF length(_ingame) < 2 OR length(_ingame) > 40 THEN
    RAISE EXCEPTION 'Ingame-Name ungültig.';
  END IF;
  IF length(_discord) < 2 OR length(_discord) > 60 THEN
    RAISE EXCEPTION 'Discord-Name ungültig.';
  END IF;
  IF _note IS NOT NULL AND length(_note) > 500 THEN
    RAISE EXCEPTION 'Notiz zu lang.';
  END IF;

  SELECT * INTO _w FROM public.org_warehouse
    WHERE id = _warehouse_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item nicht gefunden.';
  END IF;
  IF _w.for_sale = false OR _w.locked = true THEN
    RAISE EXCEPTION 'Item ist nicht verkäuflich.';
  END IF;
  _available := coalesce(_w.qty, 0) - coalesce(_w.reserved_qty, 0);
  IF _qty > _available THEN
    RAISE EXCEPTION 'Nur noch % % verfügbar.', _available, _w.unit;
  END IF;

  UPDATE public.org_warehouse
    SET reserved_qty = coalesce(reserved_qty, 0) + _qty,
        reserved_at = now()
    WHERE id = _warehouse_id;

  INSERT INTO public.shop_reservations (
    warehouse_id, org_id, item_ref, item_name, qty, unit,
    unit_price, total_price,
    buyer_ingame_name, buyer_discord_name, buyer_note
  ) VALUES (
    _w.id, _w.org_id, _w.item_ref, _w.item_name, _qty, _w.unit,
    coalesce(_w.sale_price, 0), coalesce(_w.sale_price, 0) * _qty,
    _ingame, _discord, _note
  ) RETURNING id INTO _res_id;

  RETURN _res_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shop_reservation(uuid, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shop_reservation(uuid, numeric, text, text, text) TO service_role;
