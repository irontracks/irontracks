-- Live Activity push tokens (Feature 11 — Dynamic Island remote updates)
--
-- Each iOS Live Activity (rest timer, workout) gets its own APNs push token.
-- The backend uses these tokens to update the Lock Screen / Dynamic Island via
-- APNs even when the app is backgrounded or killed.
--
-- Token rotation: Apple rotates these periodically over the activity's lifetime,
-- so we upsert on (user_id, kind, activity_id). Stale tokens are pruned by a
-- daily job (TODO: see edge function clean_live_activity_tokens).

create table if not exists public.live_activity_push_tokens (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null check (length(kind) between 1 and 32),
  activity_id  text        not null default '',
  token        text        not null check (length(token) between 32 and 256),
  platform     text        not null default 'ios' check (platform in ('ios')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, kind, activity_id)
);

create index if not exists live_activity_push_tokens_kind_idx
  on public.live_activity_push_tokens (kind, updated_at desc);

-- Row Level Security — users can only read / write their own tokens.
-- (Server uses the service role to read everyone's tokens for push delivery.)
alter table public.live_activity_push_tokens enable row level security;

create policy "live_activity_tokens_select_own"
  on public.live_activity_push_tokens
  for select
  using (auth.uid() = user_id);

create policy "live_activity_tokens_upsert_own"
  on public.live_activity_push_tokens
  for insert
  with check (auth.uid() = user_id);

create policy "live_activity_tokens_update_own"
  on public.live_activity_push_tokens
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "live_activity_tokens_delete_own"
  on public.live_activity_push_tokens
  for delete
  using (auth.uid() = user_id);

comment on table  public.live_activity_push_tokens is 'iOS Live Activity APNs push tokens — used by backend to update Dynamic Island / Lock Screen remotely. Token rotates over activity lifetime; upsert on (user_id, kind, activity_id).';
comment on column public.live_activity_push_tokens.kind        is 'Activity kind: rest, workout, etc.';
comment on column public.live_activity_push_tokens.activity_id is 'Activity.id from ActivityKit (UUID-ish). Empty string for legacy/snapshot rows.';
comment on column public.live_activity_push_tokens.token       is 'APNs push token, lowercase hex.';
