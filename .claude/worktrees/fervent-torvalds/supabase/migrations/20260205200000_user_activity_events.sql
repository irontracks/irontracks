create extension if not exists pgcrypto;

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  role text,
  display_name text,
  event_name text not null,
  event_type text,
  screen text,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  client_ts timestamptz,
  user_agent text,
  app_version text
);

create index if not exists user_activity_events_user_id_created_at_idx
  on public.user_activity_events (user_id, created_at desc);

create index if not exists user_activity_events_event_name_created_at_idx
  on public.user_activity_events (event_name, created_at desc);

alter table public.user_activity_events enable row level security;

drop policy if exists "Admin can select user activity events" on public.user_activity_events;
create policy "Admin can select user activity events"
  on public.user_activity_events
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Service role can insert user activity events" on public.user_activity_events;
create policy "Service role can insert user activity events"
  on public.user_activity_events
  for insert
  to service_role
  with check (true);

drop policy if exists "Admin can insert user activity events" on public.user_activity_events;
create policy "Admin can insert user activity events"
  on public.user_activity_events
  for insert
  to authenticated
  with check (public.is_admin());
