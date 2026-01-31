begin;

alter table public.app_subscriptions
  add column if not exists provider text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_customer_id text;

update public.app_subscriptions
set provider = 'asaas'
where provider is null and asaas_subscription_id is not null;

update public.app_subscriptions
set provider_subscription_id = asaas_subscription_id
where provider_subscription_id is null and asaas_subscription_id is not null;

update public.app_subscriptions
set provider_customer_id = asaas_customer_id
where provider_customer_id is null and asaas_customer_id is not null;

create unique index if not exists app_subscriptions_provider_subscription_id_ux
on public.app_subscriptions (provider, provider_subscription_id)
where provider is not null and provider_subscription_id is not null;

alter table public.app_payments
  add column if not exists provider text,
  add column if not exists provider_payment_id text;

update public.app_payments
set provider = 'asaas'
where provider is null and asaas_payment_id is not null;

update public.app_payments
set provider_payment_id = asaas_payment_id
where provider_payment_id is null and asaas_payment_id is not null;

create unique index if not exists app_payments_provider_payment_id_ux
on public.app_payments (provider, provider_payment_id)
where provider is not null and provider_payment_id is not null;

create table if not exists public.mercadopago_webhook_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  data_id text not null,
  event_type text,
  action text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists mercadopago_webhook_events_dedupe_ux
on public.mercadopago_webhook_events (request_id, data_id);

alter table public.mercadopago_webhook_events enable row level security;

drop policy if exists "mercadopago_webhook_events_admin" on public.mercadopago_webhook_events;
create policy "mercadopago_webhook_events_admin"
on public.mercadopago_webhook_events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

commit;

