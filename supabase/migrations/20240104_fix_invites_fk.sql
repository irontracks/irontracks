
-- FIX 400 ERROR: Link Invites to Profiles for Query Support

-- 1. Drop existing FK constraint if it points to auth.users
alter table invites drop constraint if exists invites_from_uid_fkey;
alter table invites drop constraint if exists invites_to_uid_fkey;

-- 2. Add FK constraint pointing to public.profiles
-- This enables PostgREST to resolve 'select=*,profiles:from_uid(...)'
alter table invites
  add constraint invites_from_uid_fkey
  foreign key (from_uid)
  references public.profiles(id)
  on delete cascade;

alter table invites
  add constraint invites_to_uid_fkey
  foreign key (to_uid)
  references public.profiles(id)
  on delete cascade;

-- 3. Verify RLS is still good (re-apply just in case)
alter table invites enable row level security;
