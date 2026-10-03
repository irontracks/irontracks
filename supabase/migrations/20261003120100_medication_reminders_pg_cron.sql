-- Lembrete de medicamento: quem puxa o gatilho a cada 5 minutos.
--
-- Por que existe: o push "💊 08:00 · Losartana · 50 mg" sai da rota
-- `/api/cron/medication-reminders`, e alguém precisa chamá-la. Este cron NÃO
-- está no `vercel.json` de propósito — a conta Vercel é HOBBY e só aceita
-- expressão DIÁRIA (ver a migration do `meal-reminders`). O disparo vem do banco.
--
-- ⚠️ APLICAR SÓ DEPOIS DO DEPLOY DA ROTA. Antes disso a rota não existe em
-- produção e o job passaria a gerar 288 requisições/dia respondendo 404, sem
-- nenhum sinal fora de `cron.job_run_details`.
--
-- O segredo: o job de produção lê `public.cron_secrets` (name = 'cron') e cai
-- para o Vault (`cron_secret`). Esta migration copia o comando de PRODUÇÃO — a
-- migration do `meal-reminders` no repo está atrás dele. Sem segredo nenhum, o
-- `where s.secret is not null` impede a chamada (senão seriam requisições 403).
--
-- ⚠️ Diagnóstico em duas consultas — cada uma responde uma pergunta, e sozinha
-- nenhuma fecha o caso:
--
--   -- 1. o job rodou? chegou a fazer a requisição?
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'medication-reminders')
--   order by start_time desc limit 5;
--
--   -- 2. o que a rota respondeu?
--   select status_code, left(content, 200), created
--   from net._http_response order by created desc limit 5;
--
-- ⚠️ `succeeded` no pg_cron NÃO quer dizer que a rota foi chamada: com o segredo
-- ausente o `select` devolve "0 rows" e o status continua `succeeded`. Se a
-- consulta 1 mostra "0 rows", a rota NÃO foi chamada.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Idempotente: reaplicar troca o job em vez de duplicar.
select cron.unschedule(jobid) from cron.job where jobname = 'medication-reminders';

select cron.schedule(
  'medication-reminders',
  '*/5 * * * *',
  $job$
  with s as (
    select coalesce(
      (select secret from public.cron_secrets where name = 'cron' limit 1),
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ) as secret
  )
  select net.http_get(
    url := 'https://irontracks.com.br/api/cron/medication-reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.secret),
    timeout_milliseconds := 20000
  )
  from s
  where s.secret is not null;
  $job$
);
