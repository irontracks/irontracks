-- supabase/migrations/20260425130000_add_profile_handle.sql
--
-- Adds a public @handle to profiles so other users can be @mentioned in
-- chat and story comments. NULL allowed for backwards compatibility — only
-- users who explicitly pick a handle become mentionable.
--
-- Format: 3-20 chars, starts with a letter, [a-z0-9_]. Stored lowercased.

alter table public.profiles
  add column if not exists handle text;

alter table public.profiles
  drop constraint if exists profiles_handle_format;

alter table public.profiles
  add constraint profiles_handle_format
  check (handle is null or handle ~ '^[a-z][a-z0-9_]{2,19}$');

create unique index if not exists profiles_handle_unique_idx
  on public.profiles (lower(handle))
  where handle is not null;
