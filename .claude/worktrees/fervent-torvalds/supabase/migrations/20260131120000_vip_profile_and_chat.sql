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

create table if not exists public.vip_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goal text,
  equipment text,
  constraints text,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vip_profile_set_updated_at on public.vip_profile;
create trigger trg_vip_profile_set_updated_at
before update on public.vip_profile
for each row execute function public.set_updated_at();

alter table public.vip_profile enable row level security;

drop policy if exists "vip_profile_select_own" on public.vip_profile;
drop policy if exists "vip_profile_insert_own" on public.vip_profile;
drop policy if exists "vip_profile_update_own" on public.vip_profile;
drop policy if exists "vip_profile_delete_own" on public.vip_profile;

create policy "vip_profile_select_own"
on public.vip_profile for select
using (user_id = auth.uid());

create policy "vip_profile_insert_own"
on public.vip_profile for insert
with check (user_id = auth.uid());

create policy "vip_profile_update_own"
on public.vip_profile for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "vip_profile_delete_own"
on public.vip_profile for delete
using (user_id = auth.uid());

create table if not exists public.vip_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vip_chat_threads_set_updated_at on public.vip_chat_threads;
create trigger trg_vip_chat_threads_set_updated_at
before update on public.vip_chat_threads
for each row execute function public.set_updated_at();

create index if not exists vip_chat_threads_user_id_idx
on public.vip_chat_threads (user_id);

create index if not exists vip_chat_threads_user_id_updated_at_idx
on public.vip_chat_threads (user_id, updated_at desc);

alter table public.vip_chat_threads enable row level security;

drop policy if exists "vip_chat_threads_select_own" on public.vip_chat_threads;
drop policy if exists "vip_chat_threads_insert_own" on public.vip_chat_threads;
drop policy if exists "vip_chat_threads_update_own" on public.vip_chat_threads;
drop policy if exists "vip_chat_threads_delete_own" on public.vip_chat_threads;

create policy "vip_chat_threads_select_own"
on public.vip_chat_threads for select
using (user_id = auth.uid());

create policy "vip_chat_threads_insert_own"
on public.vip_chat_threads for insert
with check (user_id = auth.uid());

create policy "vip_chat_threads_update_own"
on public.vip_chat_threads for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "vip_chat_threads_delete_own"
on public.vip_chat_threads for delete
using (user_id = auth.uid());

create table if not exists public.vip_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.vip_chat_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists vip_chat_messages_thread_id_created_at_idx
on public.vip_chat_messages (thread_id, created_at);

create index if not exists vip_chat_messages_user_id_created_at_idx
on public.vip_chat_messages (user_id, created_at);

alter table public.vip_chat_messages enable row level security;

drop policy if exists "vip_chat_messages_select_own" on public.vip_chat_messages;
drop policy if exists "vip_chat_messages_insert_own" on public.vip_chat_messages;
drop policy if exists "vip_chat_messages_update_own" on public.vip_chat_messages;
drop policy if exists "vip_chat_messages_delete_own" on public.vip_chat_messages;

create policy "vip_chat_messages_select_own"
on public.vip_chat_messages for select
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.vip_chat_threads t
    where t.id = vip_chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

create policy "vip_chat_messages_insert_own"
on public.vip_chat_messages for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.vip_chat_threads t
    where t.id = vip_chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

create policy "vip_chat_messages_update_own"
on public.vip_chat_messages for update
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.vip_chat_threads t
    where t.id = vip_chat_messages.thread_id
      and t.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.vip_chat_threads t
    where t.id = vip_chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

create policy "vip_chat_messages_delete_own"
on public.vip_chat_messages for delete
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.vip_chat_threads t
    where t.id = vip_chat_messages.thread_id
      and t.user_id = auth.uid()
  )
);

commit;

