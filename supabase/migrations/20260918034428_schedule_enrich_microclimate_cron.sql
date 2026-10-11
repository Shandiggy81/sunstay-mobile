-- Production already has this job (recorded as 20260918034428 on fksuqgvsazoxarocmaii).
-- The SQL production ran embedded the project URL and an anon JWT as literals. This copy
-- reads both from Supabase Vault at run time instead, so no key is committed. It differs
-- from production's stored statement only in those values and in this comment block.
-- Before replaying it anywhere else, create the two Vault secrets once:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<anon key>', 'anon_key');

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
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/enrich-microclimate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);