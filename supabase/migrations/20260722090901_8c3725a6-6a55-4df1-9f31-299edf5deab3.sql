
-- Shop reservations become group-based (across multiple warehouse positions)

ALTER TABLE public.shop_reservations
  ALTER COLUMN warehouse_id DROP NOT NULL;

-- Allocation table: which warehouse position(s) a reservation consumes.
CREATE TABLE IF NOT EXISTS public.shop_reservation_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.shop_reservations(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.org_warehouse(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  qty numeric NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_reservation_allocations_res_idx
  ON public.shop_reservation_allocations(reservation_id);
CREATE INDEX IF NOT EXISTS shop_reservation_allocations_wh_idx
  ON public.shop_reservation_allocations(warehouse_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_reservation_allocations TO authenticated;
GRANT ALL ON public.shop_reservation_allocations TO service_role;

ALTER TABLE public.shop_reservation_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse mgr reads allocations" ON public.shop_reservation_allocations;
CREATE POLICY "warehouse mgr reads allocations"
  ON public.shop_reservation_allocations FOR SELECT
  TO authenticated
  USING (public.has_org_perm(auth.uid(), org_id, 'warehouse.manage'));

-- Backfill: for any existing reservation with a warehouse_id, seed one allocation row.
INSERT INTO public.shop_reservation_allocations (reservation_id, warehouse_id, org_id, qty)
SELECT r.id, r.warehouse_id, r.org_id, r.qty
FROM public.shop_reservations r
LEFT JOIN public.shop_reservation_allocations a ON a.reservation_id = r.id
WHERE r.warehouse_id IS NOT NULL
  AND r.status IN ('pending','reserved','in_progress')
  AND a.id IS NULL;

-- New group-based RPC: distributes reservation across all matching org_warehouse positions.
CREATE OR REPLACE FUNCTION public.create_shop_reservation_group(
  _org_id uuid,
  _item_ref text,
  _item_name text,
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

  -- Lock all matching positions for this item within the org.
  -- We need a snapshot; compute totals first.
  CREATE TEMP TABLE IF NOT EXISTS _shop_pick(
    id uuid, qty numeric, sale_qty numeric, reserved_qty numeric,
    sale_price numeric, unit text, created_at timestamptz
  ) ON COMMIT DROP;
  DELETE FROM _shop_pick;

  FOR _row IN
    SELECT w.id, w.qty, w.sale_qty, w.reserved_qty, w.sale_price, w.unit, w.created_at
    FROM public.org_warehouse w
    WHERE w.org_id = _org_id
      AND w.for_sale = true
      AND w.locked = false
      AND (
        (_item_ref IS NOT NULL AND w.item_ref = _item_ref)
        OR (_item_ref IS NULL AND lower(btrim(w.item_name)) = lower(btrim(_item_name)))
      )
    ORDER BY w.created_at ASC
    FOR UPDATE
  LOOP
    _offered := LEAST(coalesce(_row.sale_qty, 0), coalesce(_row.qty, 0));
    _available := GREATEST(0, _offered - coalesce(_row.reserved_qty, 0));
    IF _available > 0 THEN
      INSERT INTO _shop_pick VALUES (_row.id, _row.qty, _row.sale_qty, _available, _row.sale_price, _row.unit, _row.created_at);
      _total_available := _total_available + _available;
    END IF;
  END LOOP;

  IF _total_available < _qty THEN
    RAISE EXCEPTION 'Nur noch % verfügbar.', _total_available;
  END IF;

  -- Use unit + cheapest price from first available position for the reservation record.
  SELECT unit, sale_price INTO _unit, _unit_price
  FROM _shop_pick ORDER BY sale_price ASC NULLS LAST, created_at ASC LIMIT 1;

  INSERT INTO public.shop_reservations (
    warehouse_id, org_id, item_ref, item_name, qty, unit,
    unit_price, total_price,
    buyer_ingame_name, buyer_discord_name, buyer_note
  ) VALUES (
    NULL, _org_id, _item_ref, _item_name, _qty, coalesce(_unit,'pcs'),
    coalesce(_unit_price, 0), coalesce(_unit_price, 0) * _qty,
    _ingame, _discord, _note
  ) RETURNING id INTO _res_id;

  -- Distribute FIFO across positions.
  _remaining := _qty;
  FOR _row IN
    SELECT id, reserved_qty AS available FROM _shop_pick ORDER BY created_at ASC
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

REVOKE ALL ON FUNCTION public.create_shop_reservation_group(uuid, text, text, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_shop_reservation_group(uuid, text, text, numeric, text, text, text) TO service_role;

-- Realtime publication (idempotent).
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_reservation_allocations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
ALTER TABLE public.shop_reservation_allocations REPLICA IDENTITY FULL;
