-- Lembrete de refeição: quem puxa o gatilho a cada 5 minutos.
--
-- ⚠️ Este cron NÃO está no `vercel.json`, e isso é deliberado: a conta Vercel
-- deste projeto está no plano HOBBY, que só aceita expressão DIÁRIA. Uma
-- entrada `*/5 * * * *` lá é recusada ANTES de o deploy ser criado — o check
-- do PR fica vermelho com "Deployment failed" e um link para a página de preços
-- de cron jobs, sem nenhum log de build (medido em 05/09/2026, PR #1073).
--
-- O disparo vem do banco, que não tem essa limitação nem cota por invocação.
--
-- O segredo NÃO fica aqui: mora no Vault, com o nome `cron_secret`, e o job só
-- chama a rota quando ele existe — sem essa guarda seriam 288 requisições/dia
-- levando 403. Para (re)cadastrar:
--   select vault.create_secret('<CRON_SECRET da Vercel>', 'cron_secret');
--
-- Conferir o que aconteceu:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'meal-reminders')
--   order by start_time desc limit 10;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('meal-reminders')
where exists (select 1 from cron.job where jobname = 'meal-reminders');

select cron.schedule(
  'meal-reminders',
  '*/5 * * * *',
  $job$
  select extensions.http_get(
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
