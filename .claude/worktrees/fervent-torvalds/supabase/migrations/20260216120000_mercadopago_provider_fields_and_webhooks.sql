begin;

create extension if not exists "pgcrypto";

alter table public.app_subscriptions
  add column if not exists provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;

update public.app_subscriptions
set
  provider = coalesce(nullif(provider, ''), 'asaas'),
  provider_customer_id = coalesce(nullif(provider_customer_id, ''), nullif(asaas_customer_id, '')),
  provider_subscription_id = coalesce(nullif(provider_subscription_id, ''), nullif(asaas_subscription_id, ''))
where true;

alter table public.app_subscriptions
  alter column provider set default 'asaas';

alter table public.app_subscriptions
  alter column provider set not null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.app_subscriptions'::regclass
      and c.contype = 'c'
      and a.attname = 'provider'
  loop
    execute format('alter table public.app_subscriptions drop constraint if exists %I', r.conname);
  end loop;

  execute $sql$
    alter table public.app_subscriptions
      add constraint app_subscriptions_provider_check
      check (provider in ('asaas', 'stripe', 'apple', 'google', 'manual', 'admin', 'mercadopago'))
  $sql$;
end
$$;

create unique index if not exists app_subscriptions_provider_subscription_id_ux
  on public.app_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists app_subscriptions_provider_user_status_idx
  on public.app_subscriptions (provider, user_id, status);

alter table public.app_payments
  add column if not exists provider text,
  add column if not exists provider_payment_id text;

update public.app_payments
set
  provider = coalesce(nullif(provider, ''), 'asaas'),
  provider_payment_id = coalesce(nullif(provider_payment_id, ''), nullif(asaas_payment_id, ''))
where true;

alter table public.app_payments
  alter column provider set default 'asaas';

alter table public.app_payments
  alter column provider set not null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.app_payments'::regclass
      and c.contype = 'c'
      and a.attname = 'provider'
  loop
    execute format('alter table public.app_payments drop constraint if exists %I', r.conname);
  end loop;

  execute $sql$
    alter table public.app_payments
      add constraint app_payments_provider_check
      check (provider in ('asaas', 'stripe', 'apple', 'google', 'manual', 'admin', 'mercadopago'))
  $sql$;
end
$$;

create unique index if not exists app_payments_provider_payment_id_ux
  on public.app_payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists public.mercadopago_webhook_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  event_type text,
  action text,
  data_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists mercadopago_webhook_events_request_id_ux
  on public.mercadopago_webhook_events (request_id);

create index if not exists mercadopago_webhook_events_data_id_created_at_idx
  on public.mercadopago_webhook_events (data_id, created_at desc);

alter table public.mercadopago_webhook_events enable row level security;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.user_entitlements'::regclass
      and c.contype = 'c'
      and a.attname = 'provider'
  loop
    execute format('alter table public.user_entitlements drop constraint if exists %I', r.conname);
  end loop;

  execute $sql$
    alter table public.user_entitlements
      add constraint user_entitlements_provider_check
      check (provider in ('asaas', 'stripe', 'apple', 'google', 'manual', 'admin', 'mercadopago'))
  $sql$;
end
$$;

commit;

