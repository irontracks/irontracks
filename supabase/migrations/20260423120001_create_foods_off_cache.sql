-- supabase/migrations/20260423120001_create_foods_off_cache.sql
create table if not exists public.foods_off_cache (
  id            uuid primary key default gen_random_uuid(),
  barcode       text unique,
  food_key      text unique not null,
  name          text not null,
  brand         text,
  kcal_per_100g numeric(8,2) not null,
  protein       numeric(8,2) not null default 0,
  carbs         numeric(8,2) not null default 0,
  fat           numeric(8,2) not null default 0,
  fiber         numeric(8,2),
  source        text not null default 'open_food_facts',
  created_at    timestamptz not null default now()
);

create index if not exists foods_off_cache_barcode_idx on public.foods_off_cache (barcode) where barcode is not null;
create index if not exists foods_off_cache_food_key_idx on public.foods_off_cache (food_key);

-- RLS: everyone can read; only service_role can insert (via server-side actions)
alter table public.foods_off_cache enable row level security;

create policy "foods_off_cache_select_all"
  on public.foods_off_cache for select
  using (true);

-- No insert policy for authenticated users — inserts happen server-side with service_role
