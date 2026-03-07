begin;

create extension if not exists "pgcrypto";

create table if not exists public.vip_periodization_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  model text not null check (model in ('linear','undulating')),
  weeks integer not null check (weeks in (4,6,8)),
  goal text not null default 'hypertrophy' check (goal in ('hypertrophy','strength','recomp')),
  split text not null,
  days_per_week integer not null check (days_per_week >= 2 and days_per_week <= 6),
  time_minutes integer not null check (time_minutes >= 30 and time_minutes <= 90),
  equipment text[] not null default '{}'::text[],
  limitations text,
  start_date date,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  questionnaire jsonb not null default '{}'::jsonb check (jsonb_typeof(questionnaire) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vip_periodization_programs enable row level security;

do $$ begin
  begin drop policy if exists vip_periodization_programs_select_own on public.vip_periodization_programs; exception when others then end;
  begin drop policy if exists vip_periodization_programs_write_own on public.vip_periodization_programs; exception when others then end;
  begin drop policy if exists vip_periodization_programs_admin_all on public.vip_periodization_programs; exception when others then end;
end $$;

create policy vip_periodization_programs_select_own
on public.vip_periodization_programs for select
to authenticated
using (user_id = auth.uid());

create policy vip_periodization_programs_write_own
on public.vip_periodization_programs for insert
to authenticated
with check (user_id = auth.uid());

create policy vip_periodization_programs_admin_all
on public.vip_periodization_programs for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists vip_periodization_programs_user_status_idx
  on public.vip_periodization_programs (user_id, status, created_at desc);

create table if not exists public.vip_periodization_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.vip_periodization_programs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  week_number integer not null check (week_number >= 1 and week_number <= 12),
  day_number integer not null check (day_number >= 1 and day_number <= 7),
  phase text not null,
  is_deload boolean not null default false,
  is_test boolean not null default false,
  scheduled_date date,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.vip_periodization_workouts enable row level security;

do $$ begin
  begin drop policy if exists vip_periodization_workouts_select_own on public.vip_periodization_workouts; exception when others then end;
  begin drop policy if exists vip_periodization_workouts_write_own on public.vip_periodization_workouts; exception when others then end;
  begin drop policy if exists vip_periodization_workouts_admin_all on public.vip_periodization_workouts; exception when others then end;
end $$;

create policy vip_periodization_workouts_select_own
on public.vip_periodization_workouts for select
to authenticated
using (user_id = auth.uid());

create policy vip_periodization_workouts_write_own
on public.vip_periodization_workouts for insert
to authenticated
with check (user_id = auth.uid());

create policy vip_periodization_workouts_admin_all
on public.vip_periodization_workouts for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create unique index if not exists vip_periodization_workouts_program_week_day_ux
  on public.vip_periodization_workouts (program_id, week_number, day_number);

create index if not exists vip_periodization_workouts_user_scheduled_idx
  on public.vip_periodization_workouts (user_id, scheduled_date);

create index if not exists vip_periodization_workouts_user_program_idx
  on public.vip_periodization_workouts (user_id, program_id, week_number, day_number);

create table if not exists public.vip_periodization_exercise_state (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.vip_periodization_programs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  normalized_exercise_name text not null,
  estimated_1rm numeric,
  last_weight numeric,
  last_reps integer,
  updated_at timestamptz not null default now()
);

alter table public.vip_periodization_exercise_state enable row level security;

do $$ begin
  begin drop policy if exists vip_periodization_exercise_state_select_own on public.vip_periodization_exercise_state; exception when others then end;
  begin drop policy if exists vip_periodization_exercise_state_write_own on public.vip_periodization_exercise_state; exception when others then end;
  begin drop policy if exists vip_periodization_exercise_state_admin_all on public.vip_periodization_exercise_state; exception when others then end;
end $$;

create policy vip_periodization_exercise_state_select_own
on public.vip_periodization_exercise_state for select
to authenticated
using (user_id = auth.uid());

create policy vip_periodization_exercise_state_write_own
on public.vip_periodization_exercise_state for insert
to authenticated
with check (user_id = auth.uid());

create policy vip_periodization_exercise_state_admin_all
on public.vip_periodization_exercise_state for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create unique index if not exists vip_periodization_exercise_state_program_ex_ux
  on public.vip_periodization_exercise_state (program_id, normalized_exercise_name);

alter table public.exercise_library
  add column if not exists primary_muscle text,
  add column if not exists secondary_muscles text[] not null default '{}'::text[],
  add column if not exists equipment text[] not null default '{}'::text[],
  add column if not exists difficulty text,
  add column if not exists environments text[] not null default '{}'::text[],
  add column if not exists is_compound boolean not null default false;

commit;

