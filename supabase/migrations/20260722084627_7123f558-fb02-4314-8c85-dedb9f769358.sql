
ALTER TABLE public.org_warehouse
  ADD COLUMN IF NOT EXISTS sale_qty numeric NOT NULL DEFAULT 0;

-- Bestehende Verkaufseinträge: sale_qty = qty, damit vorhandene Angebote weiterhin funktionieren.
UPDATE public.org_warehouse
  SET sale_qty = qty
  WHERE for_sale = true AND sale_qty = 0;

CREATE OR REPLACE FUNCTION public.create_shop_reservation(
  _warehouse_id uuid,
  _qty numeric,
  _buyer_ingame text,
  _buyer_discord text,
  _buyer_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _w record;
  _offered numeric;
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

  -- Nur die zum Verkauf freigegebene Menge zählt; niemals mehr als Gesamtbestand.
  _offered := LEAST(coalesce(_w.sale_qty, 0), coalesce(_w.qty, 0));
  _available := _offered - coalesce(_w.reserved_qty, 0);
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
$function$;
