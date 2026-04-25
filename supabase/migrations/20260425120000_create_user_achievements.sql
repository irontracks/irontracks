-- supabase/migrations/20260425120000_create_user_achievements.sql
--
-- Persists which badges each user has unlocked, so the "achievement unlocked"
-- social notification fires exactly once per badge per user. Without this,
-- the badge derivation in computeWorkoutStreakAndStats would re-trigger on
-- every workout finish.

create table if not exists public.user_achievements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  badge_id     text not null,
  badge_label  text not null,
  badge_kind   text not null,
  unlocked_at  timestamptz not null default now()
);

create unique index if not exists user_achievements_user_badge_idx
  on public.user_achievements (user_id, badge_id);

create index if not exists user_achievements_user_id_idx
  on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

create policy "user_achievements_select_own"
  on public.user_achievements for select
  using (auth.uid() = user_id);

-- Per-user variant of iron_rank_my_total_volume so service_role can compute
-- volume during workout finish (the original RPC reads auth.uid() which is
-- NULL when invoked via the admin client).
create or replace function public.iron_rank_total_volume_for_user(p_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := auth.role();
begin
  if coalesce(caller_role, '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  return coalesce(
    (
      with base_workouts as (
        select w.id, w.notes
        from public.workouts w
        where w.is_template = false and w.user_id = p_user_id
      ),
      sets_by_workout as (
        select bw.id as workout_id,
          sum(coalesce(s.weight, 0) * coalesce(public.try_parse_numeric(s.reps::text), 0)) as volume_kg
        from base_workouts bw
        join public.exercises e on e.workout_id = bw.id
        join public.sets s on s.exercise_id = e.id
        where coalesce(s.completed, true) = true
          and coalesce(s.weight, 0) > 0
          and coalesce(public.try_parse_numeric(s.reps::text), 0) > 0
        group by bw.id
      ),
      legacy_by_workout as (
        select bw.id as workout_id,
          sum(public.try_parse_numeric(j.value->>'weight') * public.try_parse_numeric(j.value->>'reps')) as volume_kg
        from base_workouts bw
        cross join lateral jsonb_each(coalesce((public.try_parse_jsonb(bw.notes)->'logs'), '{}'::jsonb)) as j(key, value)
        where not exists (select 1 from sets_by_workout sbw where sbw.workout_id = bw.id)
          and lower(coalesce(j.value->>'done', '')) in ('true', 't', '1', 'yes', 'y')
          and coalesce(public.try_parse_numeric(j.value->>'weight'), 0) > 0
          and coalesce(public.try_parse_numeric(j.value->>'reps'), 0) > 0
        group by bw.id
      ),
      lifted as (
        select sum(x.volume_kg) as total_volume_kg
        from (
          select volume_kg from sets_by_workout
          union all
          select volume_kg from legacy_by_workout
        ) x
      )
      select l.total_volume_kg from lifted l
    ),
    0
  );
end;
$$;

revoke all on function public.iron_rank_total_volume_for_user(uuid) from public, anon, authenticated;
grant execute on function public.iron_rank_total_volume_for_user(uuid) to service_role;
