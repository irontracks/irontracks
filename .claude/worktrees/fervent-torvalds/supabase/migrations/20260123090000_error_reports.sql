create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'error_report_status'
  ) then
    create type public.error_report_status as enum ('new', 'triaged', 'resolved', 'ignored');
  end if;
end $$;

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  user_email text,
  message text not null,
  stack text,
  pathname text,
  url text,
  user_agent text,
  app_version text,
  source text,
  meta jsonb not null default '{}'::jsonb,
  status public.error_report_status not null default 'new',
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_error_reports()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_error_reports_updated_at on public.error_reports;
create trigger trg_error_reports_updated_at
before update on public.error_reports
for each row execute function public.set_updated_at_error_reports();

create index if not exists error_reports_user_id_idx on public.error_reports (user_id);
create index if not exists error_reports_created_at_idx on public.error_reports (created_at desc);
create index if not exists error_reports_status_created_at_idx on public.error_reports (status, created_at desc);
create index if not exists error_reports_source_created_at_idx on public.error_reports (source, created_at desc);
create index if not exists error_reports_pathname_idx on public.error_reports (pathname);
create index if not exists error_reports_meta_gin_idx on public.error_reports using gin (meta);

alter table public.error_reports enable row level security;

drop policy if exists "error_reports_insert_own" on public.error_reports;
create policy "error_reports_insert_own"
on public.error_reports
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "error_reports_admin_select" on public.error_reports;
create policy "error_reports_admin_select"
on public.error_reports
for select
to authenticated
using (public.is_admin());

drop policy if exists "error_reports_admin_update" on public.error_reports;
create policy "error_reports_admin_update"
on public.error_reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

