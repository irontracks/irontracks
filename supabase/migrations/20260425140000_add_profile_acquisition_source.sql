-- supabase/migrations/20260425140000_add_profile_acquisition_source.sql
--
-- Adds first-touch acquisition tracking to profiles. The client captures
-- UTM params from the URL on the very first visit, persists them in
-- localStorage, and POSTs to /api/profiles/acquisition once the user
-- authenticates. The server only writes if acquisition_source is still
-- NULL — first-touch attribution wins.

alter table public.profiles
  add column if not exists acquisition_source jsonb;

-- Indexes target the two fields most useful for ROI queries: campaign
-- (granular A/B variant) and source (channel). Partial so they only
-- index attributed users.
create index if not exists profiles_acquisition_campaign_idx
  on public.profiles ((acquisition_source->>'campaign'))
  where acquisition_source is not null;

create index if not exists profiles_acquisition_source_idx
  on public.profiles ((acquisition_source->>'source'))
  where acquisition_source is not null;
