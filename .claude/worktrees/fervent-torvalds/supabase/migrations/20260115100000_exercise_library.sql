begin;

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  display_name_pt text not null,
  normalized_name text not null unique,
  video_url text,
  aliases text[],
  created_at timestamptz not null default now()
);

alter table public.exercise_library enable row level security;

do $$ begin
  begin drop policy if exists exercise_library_read_authenticated on public.exercise_library; exception when others then end;
  begin drop policy if exists exercise_library_insert_admin on public.exercise_library; exception when others then end;
  begin drop policy if exists exercise_library_update_admin on public.exercise_library; exception when others then end;
  begin drop policy if exists exercise_library_delete_admin on public.exercise_library; exception when others then end;
end $$;

create policy exercise_library_read_authenticated
on public.exercise_library
for select
to authenticated
using (true);

create policy exercise_library_insert_admin
on public.exercise_library
for insert
to authenticated
with check (public.is_admin());

create policy exercise_library_update_admin
on public.exercise_library
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy exercise_library_delete_admin
on public.exercise_library
for delete
to authenticated
using (public.is_admin());

commit;

