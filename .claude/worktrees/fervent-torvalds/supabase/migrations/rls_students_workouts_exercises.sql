-- Enable and define robust RLS for students, workouts and exercises

-- STUDENTS
alter table if exists public.students enable row level security;
drop policy if exists "students_select_teacher_or_admin" on public.students;
drop policy if exists "students_insert_by_teacher" on public.students;
drop policy if exists "students_update_teacher_or_admin" on public.students;
drop policy if exists "students_delete_teacher_or_admin" on public.students;

create policy "students_select_teacher_or_admin"
on public.students
for select
to authenticated
using (
  teacher_id = auth.uid()
  or (auth.jwt() ->> 'email') = 'djmkapple@gmail.com'
);

create policy "students_insert_by_teacher"
on public.students
for insert
to authenticated
with check (
  teacher_id = auth.uid()
);

create policy "students_update_teacher_or_admin"
on public.students
for update
to authenticated
using (
  teacher_id = auth.uid()
  or (auth.jwt() ->> 'email') = 'djmkapple@gmail.com'
)
with check (
  teacher_id = auth.uid()
  or (auth.jwt() ->> 'email') = 'djmkapple@gmail.com'
);

create policy "students_delete_teacher_or_admin"
on public.students
for delete
to authenticated
using (
  teacher_id = auth.uid()
  or (auth.jwt() ->> 'email') = 'djmkapple@gmail.com'
);

-- WORKOUTS
alter table if exists public.workouts enable row level security;
drop policy if exists "workouts_select_teacher_self_or_students" on public.workouts;
drop policy if exists "workouts_insert_teacher_or_admin" on public.workouts;
drop policy if exists "workouts_update_teacher_or_admin" on public.workouts;
drop policy if exists "workouts_delete_teacher_or_admin" on public.workouts;
drop policy if exists "workouts_admin_all" on public.workouts;

create policy "workouts_select_teacher_self_or_students"
on public.workouts
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.students s where s.id = public.workouts.user_id and s.teacher_id = auth.uid()
  )
);

create policy "workouts_insert_teacher_or_admin"
on public.workouts
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.students s where s.id = public.workouts.user_id and s.teacher_id = auth.uid()
  )
);

create policy "workouts_update_teacher_or_admin"
on public.workouts
for update
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.students s where s.id = public.workouts.user_id and s.teacher_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.students s where s.id = public.workouts.user_id and s.teacher_id = auth.uid()
  )
);

create policy "workouts_delete_teacher_or_admin"
on public.workouts
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.students s where s.id = public.workouts.user_id and s.teacher_id = auth.uid()
  )
);

create policy "workouts_admin_all"
on public.workouts
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'djmkapple@gmail.com')
with check ((auth.jwt() ->> 'email') = 'djmkapple@gmail.com');

-- EXERCISES
alter table if exists public.exercises enable row level security;
drop policy if exists "exercises_select_by_teacher_through_workouts" on public.exercises;
drop policy if exists "exercises_insert_by_teacher_through_workouts" on public.exercises;
drop policy if exists "exercises_update_by_teacher_through_workouts" on public.exercises;
drop policy if exists "exercises_admin_all" on public.exercises;

create policy "exercises_select_by_teacher_through_workouts"
on public.exercises
for select
to authenticated
using (
  exists (
    select 1 from public.workouts w
    left join public.students s on s.id = w.user_id
    where w.id = public.exercises.workout_id
      and (w.user_id = auth.uid() or s.teacher_id = auth.uid())
  )
);

create policy "exercises_insert_by_teacher_through_workouts"
on public.exercises
for insert
to authenticated
with check (
  exists (
    select 1 from public.workouts w
    left join public.students s on s.id = w.user_id
    where w.id = public.exercises.workout_id
      and (w.user_id = auth.uid() or s.teacher_id = auth.uid())
  )
);

create policy "exercises_update_by_teacher_through_workouts"
on public.exercises
for update
to authenticated
using (
  exists (
    select 1 from public.workouts w
    left join public.students s on s.id = w.user_id
    where w.id = public.exercises.workout_id
      and (w.user_id = auth.uid() or s.teacher_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.workouts w
    left join public.students s on s.id = w.user_id
    where w.id = public.exercises.workout_id
      and (w.user_id = auth.uid() or s.teacher_id = auth.uid())
  )
);

create policy "exercises_admin_all"
on public.exercises
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'djmkapple@gmail.com')
with check ((auth.jwt() ->> 'email') = 'djmkapple@gmail.com');

-- TEACHERS (optional select, for payment status checks)
alter table if exists public.teachers enable row level security;
drop policy if exists "teachers_select_self_or_admin" on public.teachers;
create policy "teachers_select_self_or_admin"
on public.teachers
for select
to authenticated
using (email = (auth.jwt() ->> 'email') or (auth.jwt() ->> 'email') = 'djmkapple@gmail.com');

