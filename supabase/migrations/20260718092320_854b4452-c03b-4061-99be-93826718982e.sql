
CREATE TABLE public.wiki_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  pages INT,
  scanned INT,
  inserted INT,
  skipped INT,
  backfilled_uex INT,
  duration_ms BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wiki_sync_runs TO authenticated;
GRANT ALL ON public.wiki_sync_runs TO service_role;
ALTER TABLE public.wiki_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read wiki sync runs" ON public.wiki_sync_runs FOR SELECT TO authenticated USING (true);
CREATE INDEX wiki_sync_runs_started_idx ON public.wiki_sync_runs(started_at DESC);
