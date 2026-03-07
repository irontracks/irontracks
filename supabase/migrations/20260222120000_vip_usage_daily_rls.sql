begin;

alter table if exists public.vip_usage_daily enable row level security;

do $$ begin
  begin drop policy if exists "vip_usage_daily_select_own" on public.vip_usage_daily; exception when others then end;
  begin drop policy if exists "vip_usage_daily_insert_own" on public.vip_usage_daily; exception when others then end;
  begin drop policy if exists "vip_usage_daily_update_own" on public.vip_usage_daily; exception when others then end;
end $$;

create policy "vip_usage_daily_select_own"
on public.vip_usage_daily for select
to authenticated
using (user_id = auth.uid());

create policy "vip_usage_daily_insert_own"
on public.vip_usage_daily for insert
to authenticated
with check (user_id = auth.uid());

create policy "vip_usage_daily_update_own"
on public.vip_usage_daily for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

commit;
