-- supabase/migrations/20260423120000_create_foods_taco.sql
create table if not exists public.foods_taco (
  id            uuid primary key default gen_random_uuid(),
  food_key      text unique not null,
  name          text not null,
  aliases       text[] not null default '{}',
  category      text,
  kcal_per_100g numeric(8,2) not null,
  protein       numeric(8,2) not null default 0,
  carbs         numeric(8,2) not null default 0,
  fat           numeric(8,2) not null default 0,
  fiber         numeric(8,2),
  created_at    timestamptz not null default now()
);

-- Full-text index on name for ILIKE queries
create index if not exists foods_taco_name_idx on public.foods_taco using gin (to_tsvector('portuguese', name));

-- Explicit index on food_key (already unique but needed for joins)
create index if not exists foods_taco_food_key_idx on public.foods_taco (food_key);

-- RLS: read-only for everyone, no writes from app
alter table public.foods_taco enable row level security;

create policy "foods_taco_select_all"
  on public.foods_taco for select
  using (true);
