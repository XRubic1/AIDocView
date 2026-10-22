-- Run blueprint steps on time with no admin tab open.
-- Calls the blueprint-wake-cron Edge Function every minute (it advances every Wait whose
-- time has passed, then sends the step's emails/notes).
--
-- Before applying, store two secrets in Supabase Vault (Dashboard → Project Settings → Vault,
-- or SQL):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the OPS_CRON_SECRET function secret>', 'ops_cron_secret');
-- The function already accepts the `x-cron-secret` header and has verify_jwt = false.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any earlier schedule with the same name.
select cron.unschedule(jobid)
from cron.job
where jobname = 'blueprint-wake-cron';

select cron.schedule(
  'blueprint-wake-cron',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/blueprint-wake-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ops_cron_secret')
    ),
    body := '{"limit": 40}'::jsonb
  );
  $$
);
