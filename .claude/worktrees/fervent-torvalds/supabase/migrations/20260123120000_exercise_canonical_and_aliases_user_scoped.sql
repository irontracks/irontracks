begin;

-- User-scoped exercise canonical names + aliases (per user)

create table if not exists public.exercise_canonical (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  normalized_name text not null,
  usage_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_canonical_display_name_non_empty check (char_length(btrim(display_name)) > 0),
  constraint exercise_canonical_normalized_name_non_empty check (char_length(btrim(normalized_name)) > 0),
  constraint exercise_canonical_user_normalized_unique unique (user_id, normalized_name),
  constraint exercise_canonical_id_user_unique unique (id, user_id)
);

create table if not exists public.exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_id uuid not null,
  alias text not null,
  normalized_alias text not null,
  confidence numeric not null default 1,
  source text not null default 'human',
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_aliases_alias_non_empty check (char_length(btrim(alias)) > 0),
  constraint exercise_aliases_normalized_alias_non_empty check (char_length(btrim(normalized_alias)) > 0),
  constraint exercise_aliases_confidence_range check (confidence >= 0 and confidence <= 1),
  constraint exercise_aliases_source_check check (source in ('deterministic', 'gemini', 'human')),
  constraint exercise_aliases_user_normalized_unique unique (user_id, normalized_alias),
  constraint exercise_aliases_canonical_fk foreign key (canonical_id, user_id)
    references public.exercise_canonical (id, user_id) on delete cascade
);

-- Indexes (beyond UNIQUE constraints)
create index if not exists exercise_canonical_user_created_at_idx
  on public.exercise_canonical (user_id, created_at desc);

create index if not exists exercise_canonical_user_usage_count_idx
  on public.exercise_canonical (user_id, usage_count desc, created_at desc);

create index if not exists exercise_aliases_user_canonical_idx
  on public.exercise_aliases (user_id, canonical_id);

create index if not exists exercise_aliases_user_created_at_idx
  on public.exercise_aliases (user_id, created_at desc);

create index if not exists exercise_aliases_user_needs_review_idx
  on public.exercise_aliases (user_id, needs_review, created_at desc);

-- Keep updated_at fresh
create or replace function public.set_updated_at_exercise_canonical()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercise_canonical_set_updated_at on public.exercise_canonical;
create trigger exercise_canonical_set_updated_at
before update on public.exercise_canonical
for each row execute function public.set_updated_at_exercise_canonical();

create or replace function public.set_updated_at_exercise_aliases()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exercise_aliases_set_updated_at on public.exercise_aliases;
create trigger exercise_aliases_set_updated_at
before update on public.exercise_aliases
for each row execute function public.set_updated_at_exercise_aliases();

-- RLS
alter table public.exercise_canonical enable row level security;
alter table public.exercise_aliases enable row level security;

-- Policies (idempotent drops)
do $$ begin
  begin drop policy if exists exercise_canonical_select_own_or_admin on public.exercise_canonical; exception when others then end;
  begin drop policy if exists exercise_canonical_insert_own_or_admin on public.exercise_canonical; exception when others then end;
  begin drop policy if exists exercise_canonical_update_own_or_admin on public.exercise_canonical; exception when others then end;
  begin drop policy if exists exercise_canonical_delete_own_or_admin on public.exercise_canonical; exception when others then end;

  begin drop policy if exists exercise_aliases_select_own_or_admin on public.exercise_aliases; exception when others then end;
  begin drop policy if exists exercise_aliases_insert_own_or_admin on public.exercise_aliases; exception when others then end;
  begin drop policy if exists exercise_aliases_update_own_or_admin on public.exercise_aliases; exception when others then end;
  begin drop policy if exists exercise_aliases_delete_own_or_admin on public.exercise_aliases; exception when others then end;
end $$;

create policy exercise_canonical_select_own_or_admin
on public.exercise_canonical
for select
to authenticated
using ((user_id = auth.uid()) or public.is_admin());

create policy exercise_canonical_insert_own_or_admin
on public.exercise_canonical
for insert
to authenticated
with check ((user_id = auth.uid()) or public.is_admin());

create policy exercise_canonical_update_own_or_admin
on public.exercise_canonical
for update
to authenticated
using ((user_id = auth.uid()) or public.is_admin())
with check ((user_id = auth.uid()) or public.is_admin());

create policy exercise_canonical_delete_own_or_admin
on public.exercise_canonical
for delete
to authenticated
using ((user_id = auth.uid()) or public.is_admin());

create policy exercise_aliases_select_own_or_admin
on public.exercise_aliases
for select
to authenticated
using ((user_id = auth.uid()) or public.is_admin());

create policy exercise_aliases_insert_own_or_admin
on public.exercise_aliases
for insert
to authenticated
with check ((user_id = auth.uid()) or public.is_admin());

create policy exercise_aliases_update_own_or_admin
on public.exercise_aliases
for update
to authenticated
using ((user_id = auth.uid()) or public.is_admin())
with check ((user_id = auth.uid()) or public.is_admin());

create policy exercise_aliases_delete_own_or_admin
on public.exercise_aliases
for delete
to authenticated
using ((user_id = auth.uid()) or public.is_admin());

commit;
