
-- REPAIR SCRIPT: Fix Tables, Policies, and Realtime

-- 1. Ensure Notifications Table Exists
create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  message text not null,
  type text default 'info',
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Ensure Team Sessions Table Exists
create table if not exists team_sessions (
  id uuid default gen_random_uuid() primary key,
  host_uid uuid references auth.users(id) not null,
  status text default 'active',
  participants jsonb default '[]',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Ensure Invites Table Exists
create table if not exists invites (
  id uuid default gen_random_uuid() primary key,
  from_uid uuid references auth.users(id) not null,
  to_uid uuid references auth.users(id) not null,
  workout_data jsonb not null,
  team_session_id uuid references team_sessions(id),
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable RLS
alter table notifications enable row level security;
alter table team_sessions enable row level security;
alter table invites enable row level security;

-- 5. Drop existing policies to avoid conflicts (clean slate for these tables)
drop policy if exists "Users can view their own notifications" on notifications;
drop policy if exists "Admins can insert notifications" on notifications;
drop policy if exists "Users can update their own notifications" on notifications;

drop policy if exists "Anyone can view team sessions they are part of" on team_sessions;
drop policy if exists "Authenticated users can create sessions" on team_sessions;
drop policy if exists "Participants can update sessions" on team_sessions;

drop policy if exists "Users can see invites sent to them" on invites;
drop policy if exists "Users can see invites they sent" on invites;
drop policy if exists "Users can send invites" on invites;
drop policy if exists "Users can update invites sent to them" on invites;

-- 6. Re-create Policies

-- Notifications
create policy "Users can view their own notifications"
  on notifications for select
  using (auth.uid() = user_id);

create policy "Admins can insert notifications"
  on notifications for insert
  with check (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Users can update their own notifications"
  on notifications for update
  using (auth.uid() = user_id);

-- Team Sessions
create policy "Anyone can view team sessions they are part of"
  on team_sessions for select
  using (true); 

create policy "Authenticated users can create sessions"
  on team_sessions for insert
  with check (auth.uid() = host_uid);

create policy "Participants can update sessions"
  on team_sessions for update
  using (true);

-- Invites
create policy "Users can see invites sent to them"
  on invites for select
  using (auth.uid() = to_uid);

create policy "Users can see invites they sent"
  on invites for select
  using (auth.uid() = from_uid);

create policy "Users can send invites"
  on invites for insert
  with check (auth.uid() = from_uid);

create policy "Users can update invites sent to them"
  on invites for update
  using (auth.uid() = to_uid);

-- 7. Enable Realtime (Publication)
-- This is critical for the "Online" features and invites popping up
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table notifications, invites, team_sessions;
commit;
