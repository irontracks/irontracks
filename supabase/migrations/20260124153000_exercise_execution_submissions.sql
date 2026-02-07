begin;

-- Exercise execution submissions (student uploads + teacher review)
create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'exercise_execution_submission_status'
  ) then
    create type public.exercise_execution_submission_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.exercise_execution_submissions (
  id uuid primary key default gen_random_uuid(),

  -- The student (auth user) who submitted the execution
  student_user_id uuid not null references auth.users (id) on delete cascade,

  -- Optional context
  exercise_library_id uuid references public.exercise_library (id) on delete set null,
  workout_id uuid references public.workouts (id) on delete set null,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text,

  -- Submission content
  notes text,
  video_bucket_id text not null default 'execution-videos',
  video_object_path text,

  -- Review
  status public.exercise_execution_submission_status not null default 'pending',
  teacher_feedback text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  -- If a storage object path is present, enforce the convention:
  --   <student_user_id>/<submission_id>/<filename>
  -- This enables safe Storage RLS based on folder prefix.
  begin
    alter table public.exercise_execution_submissions
      add constraint exercise_execution_submissions_video_path_matches_student
      check (
        video_object_path is null
        or position(student_user_id::text || '/' in video_object_path) = 1
      );
  exception when others then
    -- idempotency
  end;

  -- Require at least one reference to identify which exercise is being submitted.
  begin
    alter table public.exercise_execution_submissions
      add constraint exercise_execution_submissions_ref_check
      check (exercise_id is not null or exercise_library_id is not null or char_length(btrim(coalesce(exercise_name, ''))) > 0);
  exception when others then
    -- idempotency
  end;

  -- Keep review metadata consistent.
  begin
    alter table public.exercise_execution_submissions
      add constraint exercise_execution_submissions_review_fields_check
      check (
        (status = 'pending' and reviewed_by is null and reviewed_at is null)
        or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
      );
  exception when others then
    -- idempotency
  end;
end $$;

create index if not exists exercise_execution_submissions_student_created_at_idx
  on public.exercise_execution_submissions (student_user_id, created_at desc);

create index if not exists exercise_execution_submissions_status_created_at_idx
  on public.exercise_execution_submissions (status, created_at desc);

create index if not exists exercise_execution_submissions_exercise_library_id_idx
  on public.exercise_execution_submissions (exercise_library_id);

create index if not exists exercise_execution_submissions_exercise_id_idx
  on public.exercise_execution_submissions (exercise_id);

create index if not exists exercise_execution_submissions_workout_id_idx
  on public.exercise_execution_submissions (workout_id);

create or replace function public.set_updated_at_exercise_execution_submissions()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_exercise_execution_submissions_updated_at on public.exercise_execution_submissions;
create trigger trg_exercise_execution_submissions_updated_at
before update on public.exercise_execution_submissions
for each row execute function public.set_updated_at_exercise_execution_submissions();

-- Enforce a stricter write model than RLS alone:
-- - Students can only create/update their own submissions and cannot change status/review fields
-- - Teachers can review only submissions of their own students (via public.students)
-- - Admin can do everything
create or replace function public.enforce_exercise_execution_submissions_write_rules()
returns trigger
language plpgsql
as $fn$
declare
  v_is_admin boolean := public.is_admin();
  v_is_teacher_of_student boolean := false;
begin
  select exists (
    select 1
    from public.students s
    where s.teacher_id = auth.uid()
      and s.user_id = new.student_user_id
  ) into v_is_teacher_of_student;

  if tg_op = 'INSERT' then
    if not v_is_admin and new.student_user_id <> auth.uid() then
      raise exception 'Not allowed: student_user_id must be auth.uid()';
    end if;

    -- Students can only create pending submissions.
    if not v_is_admin and new.status <> 'pending' then
      raise exception 'Not allowed: students can only create pending submissions';
    end if;

    -- Auto-stamp review fields for admin inserts when pre-approving.
    if v_is_admin and new.status in ('approved', 'rejected') and (new.reviewed_by is null or new.reviewed_at is null) then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;

    -- Clear review fields on student inserts.
    if not v_is_admin then
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.teacher_feedback := null;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Immutable owner unless admin.
    if not v_is_admin and new.student_user_id <> old.student_user_id then
      raise exception 'Not allowed: cannot change student_user_id';
    end if;

    -- Student self update: cannot review/approve or touch review metadata.
    if not v_is_admin and not v_is_teacher_of_student and old.student_user_id = auth.uid() then
      if new.status <> old.status then
        raise exception 'Not allowed: cannot change status';
      end if;
      if new.reviewed_by is distinct from old.reviewed_by
         or new.reviewed_at is distinct from old.reviewed_at
         or new.teacher_feedback is distinct from old.teacher_feedback then
        raise exception 'Not allowed: cannot edit review fields';
      end if;
      return new;
    end if;

    -- Teacher review: only for own students.
    if not v_is_admin and v_is_teacher_of_student then
      if old.status = 'pending' and new.status in ('approved', 'rejected') then
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      end if;
      return new;
    end if;

    -- Admin update.
    if v_is_admin then
      if old.status = 'pending' and new.status in ('approved', 'rejected') and (new.reviewed_by is null or new.reviewed_at is null) then
        new.reviewed_by := auth.uid();
        new.reviewed_at := now();
      end if;
      return new;
    end if;

    raise exception 'Not allowed';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_exercise_execution_submissions_enforce_write_rules on public.exercise_execution_submissions;
create trigger trg_exercise_execution_submissions_enforce_write_rules
before insert or update on public.exercise_execution_submissions
for each row execute function public.enforce_exercise_execution_submissions_write_rules();

alter table public.exercise_execution_submissions enable row level security;

do $$ begin
  begin drop policy if exists exercise_execution_submissions_select on public.exercise_execution_submissions; exception when others then end;
  begin drop policy if exists exercise_execution_submissions_insert on public.exercise_execution_submissions; exception when others then end;
  begin drop policy if exists exercise_execution_submissions_update on public.exercise_execution_submissions; exception when others then end;
  begin drop policy if exists exercise_execution_submissions_delete on public.exercise_execution_submissions; exception when others then end;
end $$;

-- SELECT: student self, teacher for own students (via public.students.user_id), admin all
create policy exercise_execution_submissions_select
on public.exercise_execution_submissions
for select
to authenticated
using (
  public.is_admin()
  or student_user_id = auth.uid()
  or exists (
    select 1
    from public.students s
    where s.teacher_id = auth.uid()
      and s.user_id = public.exercise_execution_submissions.student_user_id
  )
);

-- INSERT: student self, admin all
create policy exercise_execution_submissions_insert
on public.exercise_execution_submissions
for insert
to authenticated
with check (
  public.is_admin()
  or student_user_id = auth.uid()
);

-- UPDATE: student self (content only; enforced by trigger), teacher for own students (review), admin all
create policy exercise_execution_submissions_update
on public.exercise_execution_submissions
for update
to authenticated
using (
  public.is_admin()
  or student_user_id = auth.uid()
  or exists (
    select 1
    from public.students s
    where s.teacher_id = auth.uid()
      and s.user_id = public.exercise_execution_submissions.student_user_id
  )
)
with check (
  public.is_admin()
  or student_user_id = auth.uid()
  or exists (
    select 1
    from public.students s
    where s.teacher_id = auth.uid()
      and s.user_id = public.exercise_execution_submissions.student_user_id
  )
);

-- DELETE: admin only (audit-friendly; avoids accidental loss)
create policy exercise_execution_submissions_delete
on public.exercise_execution_submissions
for delete
to authenticated
using (public.is_admin());

-- Optional: Storage bucket for execution videos (private)
do $$
begin
  -- Create bucket if storage schema is available
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    begin
      insert into storage.buckets (id, name, public)
      values ('execution-videos', 'execution-videos', false)
      on conflict (id) do nothing;
    exception when others then
      -- idempotency
    end;

    -- Ensure RLS is enabled
    begin
      alter table storage.objects enable row level security;
    exception when others then
      -- ignore
    end;

    -- Policies assume object paths like: <student_user_id>/<submission_id>/<filename>
    begin drop policy if exists execution_videos_select_own_teacher_admin on storage.objects; exception when others then end;
    begin drop policy if exists execution_videos_insert_own_admin on storage.objects; exception when others then end;
    begin drop policy if exists execution_videos_update_own_admin on storage.objects; exception when others then end;
    begin drop policy if exists execution_videos_delete_own_admin on storage.objects; exception when others then end;

    create policy execution_videos_select_own_teacher_admin
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'execution-videos'
      and (
        public.is_admin()
        or owner = auth.uid()
        or exists (
          select 1
          from public.students s
          where s.teacher_id = auth.uid()
            and s.user_id::text = (storage.foldername(name))[1]
        )
      )
    );

    create policy execution_videos_insert_own_admin
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'execution-videos'
      and (
        public.is_admin()
        or (
          owner = auth.uid()
          and (storage.foldername(name))[1] = auth.uid()::text
        )
      )
    );

    create policy execution_videos_update_own_admin
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'execution-videos'
      and (
        public.is_admin()
        or (owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text)
      )
    )
    with check (
      bucket_id = 'execution-videos'
      and (
        public.is_admin()
        or (owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text)
      )
    );

    create policy execution_videos_delete_own_admin
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'execution-videos'
      and (
        public.is_admin()
        or (owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text)
      )
    );
  end if;
end $$;

commit;
