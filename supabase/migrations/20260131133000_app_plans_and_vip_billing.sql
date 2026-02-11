begin;

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_plans (
  id text primary key,
  name text not null,
  description text,
  interval text not null check (interval in ('month', 'year')),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL',
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_plans_set_updated_at on public.app_plans;
create trigger trg_app_plans_set_updated_at
before update on public.app_plans
for each row execute function public.set_updated_at();

alter table public.app_plans enable row level security;

drop policy if exists "app_plans_select_active" on public.app_plans;
drop policy if exists "app_plans_write_admin" on public.app_plans;

create policy "app_plans_select_active"
on public.app_plans for select
to anon, authenticated
using (status = 'active');

create policy "app_plans_write_admin"
on public.app_plans for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.app_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.app_plans (id) on update cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled', 'inactive')),
  asaas_subscription_id text,
  asaas_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_subscriptions_set_updated_at on public.app_subscriptions;
create trigger trg_app_subscriptions_set_updated_at
before update on public.app_subscriptions
for each row execute function public.set_updated_at();

create index if not exists app_subscriptions_user_id_idx on public.app_subscriptions (user_id);
create index if not exists app_subscriptions_user_status_idx on public.app_subscriptions (user_id, status);
create unique index if not exists app_subscriptions_asaas_subscription_id_ux
on public.app_subscriptions (asaas_subscription_id)
where asaas_subscription_id is not null;

create unique index if not exists app_subscriptions_one_current_per_user_ux
on public.app_subscriptions (user_id)
where status in ('pending', 'active', 'past_due');

alter table public.app_subscriptions enable row level security;

drop policy if exists "app_subscriptions_select_own" on public.app_subscriptions;
drop policy if exists "app_subscriptions_insert_own" on public.app_subscriptions;

create policy "app_subscriptions_select_own"
on public.app_subscriptions for select
to authenticated
using (user_id = auth.uid());

create policy "app_subscriptions_insert_own"
on public.app_subscriptions for insert
to authenticated
with check (user_id = auth.uid());

create table if not exists public.app_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.app_subscriptions (id) on delete set null,
  plan_id text references public.app_plans (id) on update cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  billing_type text,
  status text not null default 'pending',
  due_date date,
  paid_at timestamptz,
  asaas_payment_id text,
  invoice_url text,
  pix_qr_code text,
  pix_payload text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_payments_user_id_created_at_idx on public.app_payments (user_id, created_at desc);
create index if not exists app_payments_subscription_id_created_at_idx on public.app_payments (subscription_id, created_at desc);
create unique index if not exists app_payments_asaas_payment_id_ux
on public.app_payments (asaas_payment_id)
where asaas_payment_id is not null;

alter table public.app_payments enable row level security;

drop policy if exists "app_payments_select_own" on public.app_payments;

create policy "app_payments_select_own"
on public.app_payments for select
to authenticated
using (user_id = auth.uid());

create table if not exists public.vip_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature_key text not null,
  day date not null default (now() at time zone 'utc')::date,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key, day)
);

drop trigger if exists trg_vip_usage_daily_set_updated_at on public.vip_usage_daily;
create trigger trg_vip_usage_daily_set_updated_at
before update on public.vip_usage_daily
for each row execute function public.set_updated_at();

alter table public.vip_usage_daily enable row level security;

drop policy if exists "vip_usage_daily_select_own" on public.vip_usage_daily;
drop policy if exists "vip_usage_daily_upsert_own" on public.vip_usage_daily;
drop policy if exists "vip_usage_daily_upsert_own_update" on public.vip_usage_daily;

create policy "vip_usage_daily_select_own"
on public.vip_usage_daily for select
to authenticated
using (user_id = auth.uid());

create policy "vip_usage_daily_upsert_own"
on public.vip_usage_daily for insert
to authenticated
with check (user_id = auth.uid());

create policy "vip_usage_daily_upsert_own_update"
on public.vip_usage_daily for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into public.app_plans (id, name, description, interval, price_cents, currency, status, sort_order, features)
values
  ('vip_start_month', 'VIP Start', 'Coach IA essencial para treinos e ajustes.', 'month', 2990, 'BRL', 'active', 10, '{"limits":{"messagesPerDay":10,"blocksPerWeek":1}}'::jsonb),
  ('vip_pro_month', 'VIP Pro', 'Mais uso diário, mais planos, mais consistência.', 'month', 5990, 'BRL', 'active', 20, '{"limits":{"messagesPerDay":30,"blocksPerWeek":3}}'::jsonb),
  ('vip_elite_month', 'VIP Elite', 'Alta intensidade de uso com fair use.', 'month', 9990, 'BRL', 'active', 30, '{"limits":{"messagesPerDay":80,"blocksPerWeek":99}}'::jsonb),
  ('vip_start_year', 'VIP Start (Anual)', '2 meses de desconto no plano Start.', 'year', 29900, 'BRL', 'active', 110, '{"limits":{"messagesPerDay":10,"blocksPerWeek":1}}'::jsonb),
  ('vip_pro_year', 'VIP Pro (Anual)', '2 meses de desconto no plano Pro.', 'year', 59900, 'BRL', 'active', 120, '{"limits":{"messagesPerDay":30,"blocksPerWeek":3}}'::jsonb),
  ('vip_elite_year', 'VIP Elite (Anual)', '2 meses de desconto no plano Elite.', 'year', 99900, 'BRL', 'active', 130, '{"limits":{"messagesPerDay":80,"blocksPerWeek":99}}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  interval = excluded.interval,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  status = excluded.status,
  sort_order = excluded.sort_order,
  features = excluded.features,
  updated_at = now();

commit;
