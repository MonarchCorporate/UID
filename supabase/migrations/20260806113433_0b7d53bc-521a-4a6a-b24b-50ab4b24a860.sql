CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('giveaways-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'giveaways-tick');

SELECT cron.schedule(
  'giveaways-tick',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uid.sc/api/public/hooks/giveaways-tick',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlcHN3bXV0aWdteXZzb2hid3ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDUwODEsImV4cCI6MjA5NTg4MTA4MX0.KU-MvPgBn9nnCyDcXGW5DMAP5_-H4FLwYKtdPfZ0W9E"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $$
);