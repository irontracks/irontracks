create table if not exists public.device_push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  token text not null,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,

  constraint device_push_tokens_token_unique unique (token)
);

create or replace function public.set_updated_at_device_push_tokens()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_device_push_tokens_updated_at on public.device_push_tokens;
create trigger trg_device_push_tokens_updated_at
before update on public.device_push_tokens
for each row execute function public.set_updated_at_device_push_tokens();

create index if not exists device_push_tokens_user_id_idx
on public.device_push_tokens (user_id);

create index if not exists device_push_tokens_user_id_platform_idx
on public.device_push_tokens (user_id, platform);

create index if not exists device_push_tokens_device_id_idx
on public.device_push_tokens (device_id);

create index if not exists device_push_tokens_last_seen_at_idx
on public.device_push_tokens (last_seen_at desc);

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
create policy "device_push_tokens_select_own"
on public.device_push_tokens
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
create policy "device_push_tokens_insert_own"
on public.device_push_tokens
for insert
to authenticated
with check (user_id = auth.uid());

create policy "device_push_tokens_update_own"
on public.device_push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "device_push_tokens_delete_own"
on public.device_push_tokens
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
create policy "device_push_tokens_update_own"
on public.device_push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;
create policy "device_push_tokens_delete_own"
on public.device_push_tokens
for delete
to authenticated
using (user_id = auth.uid());

-- NOTE: service_role usually bypasses RLS in Supabase, but this policy keeps intent explicit.
drop policy if exists "device_push_tokens_service_role_select" on public.device_push_tokens;
create policy "device_push_tokens_service_role_select"
on public.device_push_tokens
for select
to service_role
using (true);
