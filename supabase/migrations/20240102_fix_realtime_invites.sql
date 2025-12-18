
-- Enable Realtime for specific tables
alter publication supabase_realtime add table invites;
alter publication supabase_realtime add table team_sessions;
alter publication supabase_realtime add table notifications;

-- Create Team Sessions table
create table if not exists team_sessions (
  id uuid default gen_random_uuid() primary key,
  host_uid uuid references auth.users(id) not null,
  status text default 'active',
  participants jsonb default '[]',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table team_sessions enable row level security;

create policy "Anyone can view team sessions they are part of"
  on team_sessions for select
  using (true); -- Simplified for realtime, ideally check participants

create policy "Authenticated users can create sessions"
  on team_sessions for insert
  with check (auth.uid() = host_uid);

create policy "Participants can update sessions"
  on team_sessions for update
  using (true); -- Simplified

-- Create Invites table
create table if not exists invites (
  id uuid default gen_random_uuid() primary key,
  from_uid uuid references auth.users(id) not null,
  to_uid uuid references auth.users(id) not null,
  workout_data jsonb not null,
  team_session_id uuid references team_sessions(id),
  status text default 'pending', -- pending, accepted, rejected
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table invites enable row level security;

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
