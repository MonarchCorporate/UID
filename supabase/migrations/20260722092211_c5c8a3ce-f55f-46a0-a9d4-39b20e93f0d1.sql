DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='orga_orders') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orga_orders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='orga_order_reservations') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orga_order_reservations';
  END IF;
END$$;
ALTER TABLE public.orga_orders REPLICA IDENTITY FULL;
ALTER TABLE public.orga_order_reservations REPLICA IDENTITY FULL;