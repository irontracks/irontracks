create table if not exists public.coach_inbox_states (
  id uuid default gen_random_uuid() primary key,
  coach_id uuid references auth.users(id) on delete cascade not null,
  student_user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null,
  status text not null default 'open',
  snooze_until timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (coach_id, student_user_id, kind)
);

alter table public.coach_inbox_states enable row level security;

create policy "Coach inbox: coach can view own"
  on public.coach_inbox_states for select
  using (
    auth.uid() = coach_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Coach inbox: coach can insert own"
  on public.coach_inbox_states for insert
  with check (
    auth.uid() = coach_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Coach inbox: coach can update own"
  on public.coach_inbox_states for update
  using (
    auth.uid() = coach_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    auth.uid() = coach_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

