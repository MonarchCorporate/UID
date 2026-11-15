
CREATE OR REPLACE FUNCTION public.create_shop_reservation_group(_org_id uuid, _item_ref text, _item_name text, _qty numeric, _buyer_ingame text, _buyer_discord text, _buyer_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _remaining numeric;
  _take numeric;
  _offered numeric;
  _available numeric;
  _total_available numeric := 0;
  _res_id uuid;
  _ingame text;
  _discord text;
  _note text;
  _unit text;
  _unit_price numeric;
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

  CREATE TEMP TABLE IF NOT EXISTS _shop_pick(
    id uuid, qty numeric, sale_qty numeric, reserved_qty numeric,
    sale_price numeric, unit text, ordered_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE TABLE _shop_pick;

  FOR _row IN
    SELECT w.id, w.qty, w.sale_qty, w.reserved_qty, w.sale_price, w.unit,
           COALESCE(w.deposited_at, w.updated_at, now()) AS ordered_at
    FROM public.org_warehouse w
    WHERE w.org_id = _org_id
      AND w.for_sale = true
      AND w.locked = false
      AND (
        (_item_ref IS NOT NULL AND w.item_ref = _item_ref)
        OR (_item_ref IS NULL AND lower(btrim(w.item_name)) = lower(btrim(_item_name)))
      )
    ORDER BY COALESCE(w.deposited_at, w.updated_at, now()) ASC
    FOR UPDATE
  LOOP
    _offered := LEAST(coalesce(_row.sale_qty, 0), coalesce(_row.qty, 0));
    _available := GREATEST(0, _offered - coalesce(_row.reserved_qty, 0));
    IF _available > 0 THEN
      INSERT INTO _shop_pick VALUES (_row.id, _row.qty, _row.sale_qty, _available, _row.sale_price, _row.unit, _row.ordered_at);
      _total_available := _total_available + _available;
    END IF;
  END LOOP;

  IF _total_available < _qty THEN
    RAISE EXCEPTION 'Nur noch % verfügbar.', _total_available;
  END IF;

  SELECT unit, sale_price INTO _unit, _unit_price
  FROM _shop_pick ORDER BY sale_price ASC NULLS LAST, ordered_at ASC LIMIT 1;

  INSERT INTO public.shop_reservations (
    warehouse_id, org_id, item_ref, item_name, qty, unit,
    unit_price, total_price,
    buyer_ingame_name, buyer_discord_name, buyer_note
  ) VALUES (
    NULL, _org_id, _item_ref, _item_name, _qty, coalesce(_unit,'pcs'),
    coalesce(_unit_price, 0), coalesce(_unit_price, 0) * _qty,
    _ingame, _discord, _note
  ) RETURNING id INTO _res_id;

  _remaining := _qty;
  FOR _row IN
    SELECT id, reserved_qty AS available FROM _shop_pick ORDER BY ordered_at ASC
  LOOP
    EXIT WHEN _remaining <= 0;
    _take := LEAST(_row.available, _remaining);
    IF _take > 0 THEN
      UPDATE public.org_warehouse
        SET reserved_qty = coalesce(reserved_qty, 0) + _take,
            reserved_at = now()
        WHERE id = _row.id;
      INSERT INTO public.shop_reservation_allocations(reservation_id, warehouse_id, org_id, qty)
        VALUES (_res_id, _row.id, _org_id, _take);
      _remaining := _remaining - _take;
    END IF;
  END LOOP;

  RETURN _res_id;
END;
$function$;
