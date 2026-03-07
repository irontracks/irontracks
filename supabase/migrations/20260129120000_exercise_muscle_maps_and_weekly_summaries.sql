begin;

-- User-scoped exercise muscle maps + weekly summaries

create table if not exists public.exercise_muscle_maps (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_key text not null,
  canonical_name text,
  mapping jsonb not null,
  confidence numeric not null default 1,
  source text not null default 'human',
  updated_at timestamptz not null default now(),
  constraint exercise_muscle_maps_exercise_key_non_empty check (char_length(btrim(exercise_key)) > 0),
  constraint exercise_muscle_maps_canonical_name_non_empty check (canonical_name is null or char_length(btrim(canonical_name)) > 0),
  constraint exercise_muscle_maps_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint exercise_muscle_maps_user_exercise_key_pk primary key (user_id, exercise_key)
);

create table if not exists public.muscle_weekly_summaries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start_date date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint muscle_weekly_summaries_user_week_start_pk primary key (user_id, week_start_date)
);

-- Indexes (beyond PKs)
create index if not exists exercise_muscle_maps_user_updated_at_idx
  on public.exercise_muscle_maps (user_id, updated_at desc);

create index if not exists muscle_weekly_summaries_user_updated_at_idx
  on public.muscle_weekly_summaries (user_id, updated_at desc);

-- Keep updated_at fresh
create or replace function public.set_updated_at_exercise_muscle_maps()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercise_muscle_maps_set_updated_at on public.exercise_muscle_maps;
create trigger exercise_muscle_maps_set_updated_at
before update on public.exercise_muscle_maps
for each row execute function public.set_updated_at_exercise_muscle_maps();

create or replace function public.set_updated_at_muscle_weekly_summaries()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists muscle_weekly_summaries_set_updated_at on public.muscle_weekly_summaries;
create trigger muscle_weekly_summaries_set_updated_at
before update on public.muscle_weekly_summaries
for each row execute function public.set_updated_at_muscle_weekly_summaries();

-- RLS
alter table public.exercise_muscle_maps enable row level security;
alter table public.muscle_weekly_summaries enable row level security;

-- Policies (idempotent drops)
do $$ begin
  begin drop policy if exists exercise_muscle_maps_select_own on public.exercise_muscle_maps; exception when others then end;
  begin drop policy if exists exercise_muscle_maps_insert_own on public.exercise_muscle_maps; exception when others then end;
  begin drop policy if exists exercise_muscle_maps_update_own on public.exercise_muscle_maps; exception when others then end;
  begin drop policy if exists exercise_muscle_maps_delete_own on public.exercise_muscle_maps; exception when others then end;

  begin drop policy if exists muscle_weekly_summaries_select_own on public.muscle_weekly_summaries; exception when others then end;
  begin drop policy if exists muscle_weekly_summaries_insert_own on public.muscle_weekly_summaries; exception when others then end;
  begin drop policy if exists muscle_weekly_summaries_update_own on public.muscle_weekly_summaries; exception when others then end;
  begin drop policy if exists muscle_weekly_summaries_delete_own on public.muscle_weekly_summaries; exception when others then end;
end $$;

create policy exercise_muscle_maps_select_own
on public.exercise_muscle_maps
for select
to authenticated
using (user_id = auth.uid());

create policy exercise_muscle_maps_insert_own
on public.exercise_muscle_maps
for insert
to authenticated
with check (user_id = auth.uid());

create policy exercise_muscle_maps_update_own
on public.exercise_muscle_maps
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy exercise_muscle_maps_delete_own
on public.exercise_muscle_maps
for delete
to authenticated
using (user_id = auth.uid());

create policy muscle_weekly_summaries_select_own
on public.muscle_weekly_summaries
for select
to authenticated
using (user_id = auth.uid());

create policy muscle_weekly_summaries_insert_own
on public.muscle_weekly_summaries
for insert
to authenticated
with check (user_id = auth.uid());

create policy muscle_weekly_summaries_update_own
on public.muscle_weekly_summaries
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy muscle_weekly_summaries_delete_own
on public.muscle_weekly_summaries
for delete
to authenticated
using (user_id = auth.uid());

commit;
