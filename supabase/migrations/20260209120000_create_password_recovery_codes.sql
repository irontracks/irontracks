begin;

create extension if not exists pgcrypto;

create table if not exists public.password_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  last4 text,
  constraint password_recovery_codes_last4_chk check (last4 is null or (char_length(last4) = 4))
);

create index if not exists password_recovery_codes_user_created_at_idx
  on public.password_recovery_codes (user_id, created_at desc);

create index if not exists password_recovery_codes_user_unused_idx
  on public.password_recovery_codes (user_id, created_at desc)
  where used_at is null;

alter table public.password_recovery_codes enable row level security;

revoke all on table public.password_recovery_codes from anon, authenticated;
grant select, insert on table public.password_recovery_codes to authenticated;
grant update (used_at) on table public.password_recovery_codes to authenticated;

drop policy if exists prc_select_own on public.password_recovery_codes;
create policy prc_select_own
on public.password_recovery_codes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists prc_insert_own on public.password_recovery_codes;
create policy prc_insert_own
on public.password_recovery_codes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists prc_update_own_used_at on public.password_recovery_codes;
create policy prc_update_own_used_at
on public.password_recovery_codes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.create_recovery_codes(p_count int default 8)
returns table(code text, last4 text)
language plpgsql
as $$
declare
  i int;
  raw text;
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if p_count is null or p_count < 1 or p_count > 20 then
    raise exception 'Invalid count';
  end if;

  update public.password_recovery_codes
  set used_at = now()
  where user_id = auth.uid()
    and used_at is null;

  for i in 1..p_count loop
    raw := upper(encode(gen_random_bytes(8), 'hex'));
    normalized := substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4) || '-' || substr(raw, 13, 4);
    insert into public.password_recovery_codes (user_id, code_hash, last4)
    values (auth.uid(), crypt(normalized, gen_salt('bf')), right(replace(normalized, '-', ''), 4));
    code := normalized;
    last4 := right(replace(normalized, '-', ''), 4);
    return next;
  end loop;
end;
$$;

revoke all on function public.create_recovery_codes(int) from public;
grant execute on function public.create_recovery_codes(int) to authenticated;

create or replace function public.verify_recovery_code(p_code text)
returns boolean
language plpgsql
as $$
declare
  updated_count integer := 0;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.password_recovery_codes prc
  set used_at = now()
  where prc.id = (
    select prc2.id
    from public.password_recovery_codes prc2
    where prc2.user_id = auth.uid()
      and prc2.used_at is null
      and prc2.code_hash = crypt(p_code, prc2.code_hash)
    order by prc2.created_at desc
    limit 1
  );

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.verify_recovery_code(text) from public;
grant execute on function public.verify_recovery_code(text) to authenticated;

create or replace function public.verify_recovery_code_admin(p_user_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Forbidden';
  end if;

  update public.password_recovery_codes prc
  set used_at = now()
  where prc.id = (
    select prc2.id
    from public.password_recovery_codes prc2
    where prc2.user_id = p_user_id
      and prc2.used_at is null
      and prc2.code_hash = crypt(p_code, prc2.code_hash)
    order by prc2.created_at desc
    limit 1
  );

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.verify_recovery_code_admin(uuid, text) from public;

commit;

