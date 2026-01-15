begin;

create table if not exists public.exercise_videos (
  id uuid primary key default gen_random_uuid(),
  exercise_library_id uuid not null references public.exercise_library(id) on delete cascade,
  normalized_name text not null,
  provider text not null default 'youtube',
  provider_video_id text not null default '',
  url text not null,
  title text,
  channel_title text,
  language text,
  status text not null default 'pending',
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

do $$ begin
  begin
    alter table public.exercise_videos
      add constraint exercise_videos_status_check check (status in ('pending','approved','rejected'));
  exception when others then end;
end $$;

create unique index if not exists exercise_videos_unique_provider
  on public.exercise_videos (exercise_library_id, provider, provider_video_id);

create unique index if not exists exercise_videos_unique_url
  on public.exercise_videos (url);

create index if not exists exercise_videos_status_idx
  on public.exercise_videos (status, created_at desc);

create unique index if not exists exercise_videos_primary_per_exercise
  on public.exercise_videos (exercise_library_id)
  where (status = 'approved' and is_primary = true);

alter table public.exercise_videos enable row level security;

do $$ begin
  begin drop policy if exists exercise_videos_select on public.exercise_videos; exception when others then end;
  begin drop policy if exists exercise_videos_insert on public.exercise_videos; exception when others then end;
  begin drop policy if exists exercise_videos_update on public.exercise_videos; exception when others then end;
  begin drop policy if exists exercise_videos_delete on public.exercise_videos; exception when others then end;
end $$;

create policy exercise_videos_select
on public.exercise_videos
for select
to authenticated
using (status = 'approved' or public.is_admin());

create policy exercise_videos_insert
on public.exercise_videos
for insert
to authenticated
with check (public.is_admin());

create policy exercise_videos_update
on public.exercise_videos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy exercise_videos_delete
on public.exercise_videos
for delete
to authenticated
using (public.is_admin());

commit;
