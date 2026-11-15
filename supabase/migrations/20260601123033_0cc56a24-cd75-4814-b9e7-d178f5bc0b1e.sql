ALTER TABLE public.mission_ships REPLICA IDENTITY FULL;
ALTER TABLE public.mission_participants REPLICA IDENTITY FULL;
ALTER TABLE public.mission_ship_crew REPLICA IDENTITY FULL;
ALTER TABLE public.missions REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='missions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.missions';
  END IF;
END $$;