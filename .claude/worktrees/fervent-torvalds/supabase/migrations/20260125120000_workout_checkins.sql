create extension if not exists pgcrypto;

create table if not exists public.workout_checkins (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete cascade,

  kind text not null check (kind in ('pre', 'post')),

  planned_workout_id uuid references public.workouts(id) on delete set null,
  workout_id uuid references public.workouts(id) on delete set null,

  active_session_user_id uuid references public.active_workout_sessions(user_id) on delete set null,

  energy smallint check (energy between 1 and 5),
  mood smallint check (mood between 1 and 5),
  soreness smallint check (soreness between 0 and 10),
  sleep_hours numeric(4,2) check (sleep_hours between 0 and 24),
  weight_kg numeric(6,2) check (weight_kg > 0),

  notes text,
  answers jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_workout_checkins()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_workout_checkins_updated_at on public.workout_checkins;
create trigger trg_workout_checkins_updated_at
before update on public.workout_checkins
for each row execute function public.set_updated_at_workout_checkins();

create index if not exists workout_checkins_user_created_at_idx
  on public.workout_checkins (user_id, created_at desc);

create index if not exists workout_checkins_workout_id_idx
  on public.workout_checkins (workout_id);

create index if not exists workout_checkins_planned_workout_id_idx
  on public.workout_checkins (planned_workout_id);

create index if not exists workout_checkins_kind_created_at_idx
  on public.workout_checkins (kind, created_at desc);

create unique index if not exists uq_workout_checkins_post_per_workout
  on public.workout_checkins (workout_id)
  where kind = 'post' and workout_id is not null;

alter table public.workout_checkins enable row level security;

drop policy if exists workout_checkins_select on public.workout_checkins;
create policy workout_checkins_select
on public.workout_checkins
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.students s
    where s.user_id = public.workout_checkins.user_id
      and s.teacher_id = auth.uid()
  )
);

drop policy if exists workout_checkins_insert on public.workout_checkins;
create policy workout_checkins_insert
on public.workout_checkins
for insert
to authenticated
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and (active_session_user_id is null or active_session_user_id = user_id)
    and (
      planned_workout_id is null
      or exists (
        select 1 from public.workouts w
        where w.id = planned_workout_id
          and w.user_id = user_id
      )
    )
    and (
      workout_id is null
      or exists (
        select 1 from public.workouts w2
        where w2.id = workout_id
          and w2.user_id = user_id
      )
    )
  )
);

drop policy if exists workout_checkins_update on public.workout_checkins;
create policy workout_checkins_update
on public.workout_checkins
for update
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
)
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and (active_session_user_id is null or active_session_user_id = user_id)
    and (
      planned_workout_id is null
      or exists (
        select 1 from public.workouts w
        where w.id = planned_workout_id
          and w.user_id = user_id
      )
    )
    and (
      workout_id is null
      or exists (
        select 1 from public.workouts w2
        where w2.id = workout_id
          and w2.user_id = user_id
      )
    )
  )
);

drop policy if exists workout_checkins_delete on public.workout_checkins;
create policy workout_checkins_delete
on public.workout_checkins
for delete
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
);
