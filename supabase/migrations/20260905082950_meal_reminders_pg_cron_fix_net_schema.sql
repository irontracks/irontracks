-- Correção da migration anterior: o pg_net expõe `http_get` no schema **net**,
-- não em `extensions` (conferido em `pg_proc`: só existem `net.http_get` e
-- `net.http_post`). O job agendado com `extensions.http_get(...)` falhava em
-- TODA execução com "function does not exist".
--
-- ⚠️ E falhava em silêncio: nada no app, nada no Sentry, nenhum erro em lugar
-- que alguém veja — o único sinal fica em `cron.job_run_details`. Ao agendar
-- job novo, confira lá depois da primeira execução, em vez de assumir que
-- "aplicou = funciona":
--
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'meal-reminders')
--   order by start_time desc limit 5;
select cron.unschedule('meal-reminders')
where exists (select 1 from cron.job where jobname = 'meal-reminders');

select cron.schedule(
  'meal-reminders',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := 'https://irontracks.com.br/api/cron/meal-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 20000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
  $job$
);
