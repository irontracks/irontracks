begin;

-- Team session presence (Realtime-friendly)
-- Helper is used across team sessions features; keep it available and stable.
create or replace function public.jsonb_participants_has_uid(participants jsonb, uid uuid)
returns boolean
language sql
stable
as $func$
  select coalesce(participants, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', uid::text));
$func$;

create table if not exists public.team_session_presence (
  session_id uuid not null references public.team_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table public.team_session_presence enable row level security;

-- Keep updated_at fresh
create or replace function public.set_updated_at_team_session_presence()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists team_session_presence_set_updated_at on public.team_session_presence;
create trigger team_session_presence_set_updated_at
before update on public.team_session_presence
for each row execute function public.set_updated_at_team_session_presence();

-- Authorization helper used by RLS and other functions
create or replace function public.can_view_team_session(p_session_id uuid, p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ts_host uuid;
  ts_parts jsonb;
begin
  if p_session_id is null or p_uid is null then
    return false;
  end if;

  select ts.host_uid, coalesce(ts.participants, '[]'::jsonb)
    into ts_host, ts_parts
  from public.team_sessions ts
  where ts.id = p_session_id;

  if ts_host is null then
    return false;
  end if;

  if public.is_admin() then
    return true;
  end if;

  if ts_host = p_uid then
    return true;
  end if;

  return public.jsonb_participants_has_uid(ts_parts, p_uid);
end;
$$;

revoke all on function public.can_view_team_session(uuid, uuid) from public;
grant execute on function public.can_view_team_session(uuid, uuid) to authenticated;

-- Policies (read: anyone who can view the session; write: only self)
drop policy if exists team_session_presence_select on public.team_session_presence;
drop policy if exists team_session_presence_insert on public.team_session_presence;
drop policy if exists team_session_presence_update on public.team_session_presence;
drop policy if exists team_session_presence_delete on public.team_session_presence;

create policy team_session_presence_select
on public.team_session_presence
for select
to authenticated
using (
  public.can_view_team_session(session_id, auth.uid())
);

create policy team_session_presence_insert
on public.team_session_presence
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_view_team_session(session_id, auth.uid())
);

create policy team_session_presence_update
on public.team_session_presence
for update
to authenticated
using (
  user_id = auth.uid()
  and public.can_view_team_session(session_id, auth.uid())
)
with check (
  user_id = auth.uid()
  and public.can_view_team_session(session_id, auth.uid())
);

create policy team_session_presence_delete
on public.team_session_presence
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.can_view_team_session(session_id, auth.uid())
);

grant select, insert, update, delete on table public.team_session_presence to authenticated;

-- RPC: Join a team session by join code stored in team_sessions.workout_state
create or replace function public.join_team_session_by_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_code text;
  ts_id uuid;
  ts_host uuid;
  session_parts jsonb;
  ts_state jsonb;
  display_name text;
  photo_url text;
  member jsonb;
  workout_payload jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_code := nullif(btrim(code), '');
  if v_code is null then
    raise exception 'Invalid code';
  end if;

  -- Lock the session row to avoid race conditions when multiple users join
  select ts.id, ts.host_uid, coalesce(ts.participants, '[]'::jsonb)
       , coalesce(ts.workout_state, '{}'::jsonb)
    into ts_id, ts_host, session_parts, ts_state
  from public.team_sessions ts
  where coalesce(ts.status, 'active') = 'active'
    and lower(coalesce(ts.workout_state->>'join_code', ts.workout_state->>'joinCode', '')) = lower(v_code)
    and (
      nullif(coalesce(ts.workout_state->>'join_expires_at', ts.workout_state->>'joinExpiresAt', ''), '') is null
      or (coalesce(ts.workout_state->>'join_expires_at', ts.workout_state->>'joinExpiresAt'))::timestamptz > now()
    )
  order by ts.created_at desc
  limit 1
  for update;

  if ts_id is null then
    raise exception 'Invalid or expired code';
  end if;

  select p.display_name, p.photo_url
    into display_name, photo_url
  from public.profiles p
  where p.id = v_uid;

  member := jsonb_build_object(
    'uid', v_uid::text,
    'name', coalesce(display_name, ''),
    'photo', photo_url
  );

  if not public.jsonb_participants_has_uid(session_parts, v_uid) then
    session_parts := session_parts || jsonb_build_array(member);
  end if;

  update public.team_sessions
    set participants = session_parts
  where id = ts_id;

  -- Mark presence as online (idempotent)
  insert into public.team_session_presence (session_id, user_id, status)
  values (ts_id, v_uid, 'online')
  on conflict (session_id, user_id)
  do update set status = excluded.status, updated_at = now();

  workout_payload := coalesce(ts_state->'workout_data', ts_state->'workout');

  return jsonb_build_object(
    'team_session_id', ts_id,
    'host_uid', ts_host,
    'participants', session_parts,
    'workout', workout_payload
  );
end;
$$;

revoke all on function public.join_team_session_by_code(text) from public;
grant execute on function public.join_team_session_by_code(text) to authenticated;

-- RPC: Leave a team session (remove participant; if host, end the session)
create or replace function public.leave_team_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  ts_host uuid;
  session_parts jsonb;
  new_parts jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_session_id is null then
    raise exception 'Invalid session_id';
  end if;

  select ts.host_uid, coalesce(ts.participants, '[]'::jsonb)
    into ts_host, session_parts
  from public.team_sessions ts
  where ts.id = p_session_id
  for update;

  if ts_host is null then
    raise exception 'Team session not found';
  end if;

  if ts_host = v_uid then
    update public.team_sessions
      set status = 'ended'
    where id = p_session_id;

    delete from public.team_session_presence
      where team_session_presence.session_id = p_session_id;

    return jsonb_build_object(
      'ended', true,
      'team_session_id', p_session_id
    );
  end if;

  select coalesce(
    jsonb_agg(elem) filter (where coalesce(elem->>'uid','') <> v_uid::text),
    '[]'::jsonb
  )
  into new_parts
  from jsonb_array_elements(session_parts) as elem;

  update public.team_sessions
    set participants = new_parts
  where id = p_session_id;

  delete from public.team_session_presence
    where team_session_presence.session_id = p_session_id
      and user_id = v_uid;

  return jsonb_build_object(
    'ended', false,
    'team_session_id', p_session_id,
    'participants', new_parts
  );
end;
$$;

revoke all on function public.leave_team_session(uuid) from public;
grant execute on function public.leave_team_session(uuid) to authenticated;

-- Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.team_session_presence;
    exception
      when duplicate_object then
        null;
    end;
  end if;
end;
$$;

commit;
