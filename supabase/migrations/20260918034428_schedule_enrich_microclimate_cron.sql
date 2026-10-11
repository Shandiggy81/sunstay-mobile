-- Enable scheduling extensions (Supabase-supported path for Edge Function cron)
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all on all tables in schema cron to postgres;

-- Unschedule prior job if re-run
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'enrich-microclimate-every-20m';
exception when others then
  null;
end $$;

-- Invoke enrich-microclimate every 20 minutes via pg_net + anon JWT
-- (Edge runtime still uses service role internally; verify_jwt accepts anon)
select cron.schedule(
  'enrich-microclimate-every-20m',
  '*/20 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/enrich-microclimate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <REDACTED>',
      'apikey', '<REDACTED_JWT>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);