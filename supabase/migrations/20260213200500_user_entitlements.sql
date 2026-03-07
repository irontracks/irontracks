begin;

create extension if not exists "pgcrypto";

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text null references public.app_plans (id) on update cascade,
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'inactive', 'cancelled', 'revoked')),
  provider text not null default 'asaas' check (provider in ('asaas', 'stripe', 'apple', 'google', 'manual', 'admin')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  limits_override jsonb not null default '{}'::jsonb check (jsonb_typeof(limits_override) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_entitlements_set_updated_at on public.user_entitlements;
create trigger trg_user_entitlements_set_updated_at
before update on public.user_entitlements
for each row execute function public.set_updated_at();

create index if not exists user_entitlements_user_status_idx
  on public.user_entitlements (user_id, status);

create index if not exists user_entitlements_user_valid_until_idx
  on public.user_entitlements (user_id, valid_until desc);

create unique index if not exists user_entitlements_provider_subscription_id_ux
  on public.user_entitlements (provider, provider_subscription_id)
  where provider_subscription_id is not null;

alter table public.user_entitlements enable row level security;

drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
drop policy if exists "user_entitlements_admin_all" on public.user_entitlements;

create policy "user_entitlements_select_own"
on public.user_entitlements for select
to authenticated
using (user_id = auth.uid());

create policy "user_entitlements_admin_all"
on public.user_entitlements for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.user_entitlements (
  user_id,
  plan_id,
  status,
  provider,
  provider_customer_id,
  provider_subscription_id,
  current_period_start,
  current_period_end,
  valid_from,
  valid_until,
  metadata
)
select
  s.user_id,
  s.plan_id,
  case
    when s.status in ('active','trialing','past_due') then s.status
    when s.status in ('cancelled','inactive') then 'cancelled'
    else 'inactive'
  end as status,
  'asaas' as provider,
  nullif(s.asaas_customer_id, '') as provider_customer_id,
  nullif(s.asaas_subscription_id, '') as provider_subscription_id,
  s.current_period_start,
  s.current_period_end,
  coalesce(s.current_period_start, now()) as valid_from,
  s.current_period_end as valid_until,
  jsonb_build_object('backfill', true, 'from', 'app_subscriptions')
from public.app_subscriptions s
where s.status in ('active','trialing','past_due')
  and s.asaas_subscription_id is not null
on conflict (provider, provider_subscription_id) where provider_subscription_id is not null
do update set
  status = excluded.status,
  plan_id = excluded.plan_id,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end,
  valid_from = excluded.valid_from,
  valid_until = excluded.valid_until,
  metadata = excluded.metadata,
  updated_at = now();

commit;
