-- Retenção da telemetria com histórico preservado (ago/2026).
--
-- `user_activity_events` virou METADE do banco (59 MB de 119 MB, 120 mil
-- linhas) e cresce sem teto — 65% já tinha mais de 90 dias. As consultas do
-- app não estão lentas (filtram por user_id + data e usam índice), então isto
-- é higiene de armazenamento, não performance.
--
-- A regra: o DETALHE (linha a linha, com metadata) é caro e só interessa
-- recente; a TENDÊNCIA (quantos eventos de cada tipo, quantas pessoas
-- distintas, por mês) é barata e interessa para sempre. Este rollup guarda a
-- tendência antes de qualquer purga — o funil de conversão (wizard_auto_open,
-- paywall_shown, vip_trial_granted…) continua legível daqui a anos.

create table if not exists public.user_activity_monthly (
  month date not null,
  event_name text not null,
  event_type text not null default '',
  total bigint not null default 0,
  unique_users integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (month, event_name, event_type)
);

comment on table public.user_activity_monthly is
  'Agregado mensal de user_activity_events (contagem + usuários distintos). Preserva a tendência quando o detalhe bruto é purgado pela retenção.';

alter table public.user_activity_monthly enable row level security;

-- Só admin lê; a escrita é exclusiva do cron via service-role (que tem
-- BYPASSRLS). Nenhuma policy de escrita para o client, de propósito.
create policy user_activity_monthly_select_admin on public.user_activity_monthly
  for select to authenticated
  using (( select is_admin() ));

-- Rollup idempotente de uma janela: recalcula os meses tocados e regrava.
-- SECURITY DEFINER porque lê a tabela de eventos inteira (o chamador é o cron
-- com service-role, mas manter DEFINER deixa a função utilizável por um
-- backfill administrativo sem depender do papel do chamador).
create or replace function public.rollup_user_activity_monthly(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas integer;
begin
  insert into public.user_activity_monthly (month, event_name, event_type, total, unique_users, updated_at)
  select
    date_trunc('month', e.created_at)::date as month,
    coalesce(e.event_name, '') as event_name,
    coalesce(e.event_type, '') as event_type,
    count(*) as total,
    count(distinct e.user_id) as unique_users,
    now()
  from public.user_activity_events e
  where e.created_at >= p_from
    and e.created_at < (p_to + interval '1 day')
  group by 1, 2, 3
  on conflict (month, event_name, event_type) do update
    set total = excluded.total,
        unique_users = excluded.unique_users,
        updated_at = now();

  get diagnostics linhas = row_count;
  return linhas;
end;
$$;

comment on function public.rollup_user_activity_monthly(date, date) is
  'Recalcula o agregado mensal da janela informada (idempotente). Chamado pelo cron de retenção antes da purga.';
