begin;

create table if not exists public.exercise_alias_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  resolved_canonical_name text,
  resolved_canonical_id uuid,
  resolved_confidence numeric,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_alias_jobs_alias_non_empty check (char_length(btrim(alias)) > 0),
  constraint exercise_alias_jobs_normalized_alias_non_empty check (char_length(btrim(normalized_alias)) > 0),
  constraint exercise_alias_jobs_status_check check (status in ('pending', 'processing', 'done', 'failed')),
  constraint exercise_alias_jobs_confidence_range check (resolved_confidence is null or (resolved_confidence >= 0 and resolved_confidence <= 1)),
  constraint exercise_alias_jobs_user_normalized_unique unique (user_id, normalized_alias)
);

create index if not exists exercise_alias_jobs_user_status_created_idx
  on public.exercise_alias_jobs (user_id, status, created_at desc);

create or replace function public.set_updated_at_exercise_alias_jobs()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercise_alias_jobs_set_updated_at on public.exercise_alias_jobs;
create trigger exercise_alias_jobs_set_updated_at
before update on public.exercise_alias_jobs
for each row execute function public.set_updated_at_exercise_alias_jobs();

alter table public.exercise_alias_jobs enable row level security;

do $$ begin
  begin drop policy if exists exercise_alias_jobs_select_own_or_admin on public.exercise_alias_jobs; exception when others then end;
  begin drop policy if exists exercise_alias_jobs_insert_own_or_admin on public.exercise_alias_jobs; exception when others then end;
  begin drop policy if exists exercise_alias_jobs_update_own_or_admin on public.exercise_alias_jobs; exception when others then end;
  begin drop policy if exists exercise_alias_jobs_delete_own_or_admin on public.exercise_alias_jobs; exception when others then end;
end $$;

create policy exercise_alias_jobs_select_own_or_admin
on public.exercise_alias_jobs
for select
to authenticated
using ((user_id = auth.uid()) or public.is_admin());

create policy exercise_alias_jobs_insert_own_or_admin
on public.exercise_alias_jobs
for insert
to authenticated
with check ((user_id = auth.uid()) or public.is_admin());

create policy exercise_alias_jobs_update_own_or_admin
on public.exercise_alias_jobs
for update
to authenticated
using ((user_id = auth.uid()) or public.is_admin())
with check ((user_id = auth.uid()) or public.is_admin());

create policy exercise_alias_jobs_delete_own_or_admin
on public.exercise_alias_jobs
for delete
to authenticated
using ((user_id = auth.uid()) or public.is_admin());

commit;

