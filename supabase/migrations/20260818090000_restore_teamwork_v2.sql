-- Restaura o TeamworkV2 (Treino em Dupla), pedido pelo dono em 17/08/2026.
--
-- Desfaz `20260715153440_drop_teamwork_v2_and_feature_flags.sql`, que dropou as
-- 4 tabelas e 3 RPCs quando a feature foi aposentada no #428 (14/07). O código
-- voltou no PR #859; sem isto aqui ele quebra com "relation does not exist".
--
-- ── DE ONDE VEIO CADA COISA (nada foi escrito de memória) ────────────────────
--   • colunas      → `src/types/supabase.ts`, gerado quando as tabelas existiam;
--   • policies     → as versões FINAIS, pós-hardening: 20260513111015 (chat
--     select), 20260627140000 (chat insert), 20260628160000 (sessions select),
--     20260707120000 (as 4 granulares de invites);
--   • accept_team_invite → cópia fiel de 20260711092326 (com a trava de sessão
--     encerrada do #7 e o limite de 5 do #314);
--   • índices      → 20260711225138.
--
-- ⚠️ DUAS RESSALVAS HONESTAS:
--
--   1. `leave_team_session` foi **RECONSTRUÍDA**, não recuperada: o corpo dela
--      nunca esteve numa migration do repo (foi criada direto no banco). O
--      contrato veio do único chamador — `TeamWorkoutContext.leaveSession`, que
--      passa `p_session_id` e ignora o retorno. A implementação abaixo faz o
--      mínimo correto: tira o uid de participants, apaga a presença e encerra a
--      sessão quando não sobra ninguém.
--
--   2. `can_view_team_session` NÃO é recriada. Nenhum código do app a chama —
--      ela existia para as policies de `realtime.messages` do canal privado,
--      que nunca entraram (o PR #506 foi fechado). Recriá-la seria devolver
--      função morta ao banco.
--
-- O que SOBREVIVEU ao drop e por isso não aparece aqui (conferido em
-- `pg_proc` hoje): `jsonb_participants_has_uid`, `is_admin`,
-- `join_team_session_by_code`, `invites_create_notification`,
-- `enforce_invite_whitelist_v2`, `team_sessions_set_updated_at` e
-- `set_updated_at_team_session_presence`. As tabelas caíram; as funções ficaram.
--
-- Rollback: reaplicar `20260715153440_drop_teamwork_v2_and_feature_flags.sql`.

-- ── 1) Tabelas ───────────────────────────────────────────────────────────────
create table if not exists public.team_sessions (
  id uuid primary key default gen_random_uuid(),
  host_uid uuid references auth.users(id) on delete cascade,
  participants jsonb default '[]'::jsonb,   -- [{uid,name,photo}] — ver normalizeParticipant
  status text default 'active',
  workout_state jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  from_uid uuid references auth.users(id) on delete cascade,
  to_uid uuid references auth.users(id) on delete cascade,
  team_session_id uuid references public.team_sessions(id) on delete cascade,
  status text default 'pending',
  workout_data jsonb,
  created_at timestamptz default now()
);

create table if not exists public.team_session_presence (
  session_id uuid not null references public.team_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'online',
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- session_id é TEXT aqui (guarda o uuid da sessão como texto) — não é descuido:
-- é o schema real que as policies de 13/05 e 27/06 assumem (`ts.id::text =
-- team_chat_messages.session_id`). Trocar para uuid quebraria as duas.
create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  photo_url text,
  content text not null,
  created_at timestamptz not null default now()
);

-- ── 2) Índices (20260711225138) ──────────────────────────────────────────────
create index if not exists idx_invites_from_uid on public.invites (from_uid);
create index if not exists idx_invites_to_uid on public.invites (to_uid);
create index if not exists idx_team_sessions_host_uid on public.team_sessions (host_uid);
create index if not exists idx_team_session_presence_user_id on public.team_session_presence (user_id);
create index if not exists idx_team_chat_messages_session on public.team_chat_messages (session_id, created_at desc);

-- ── 3) Triggers (as funções sobreviveram ao drop) ────────────────────────────
drop trigger if exists trg_team_sessions_updated_at on public.team_sessions;
create trigger trg_team_sessions_updated_at
  before update on public.team_sessions
  for each row execute function public.team_sessions_set_updated_at();

drop trigger if exists trg_team_session_presence_updated_at on public.team_session_presence;
create trigger trg_team_session_presence_updated_at
  before update on public.team_session_presence
  for each row execute function public.set_updated_at_team_session_presence();

drop trigger if exists trg_invites_create_notification on public.invites;
create trigger trg_invites_create_notification
  after insert on public.invites
  for each row execute function public.invites_create_notification();

-- ── 4) RLS ───────────────────────────────────────────────────────────────────
alter table public.team_sessions enable row level security;
alter table public.invites enable row level security;
alter table public.team_session_presence enable row level security;
alter table public.team_chat_messages enable row level security;

-- team_sessions: só membros leem (o USING(true) foi o leak fechado em 28/06).
drop policy if exists team_sessions_select on public.team_sessions;
create policy team_sessions_select on public.team_sessions
  for select using (
    public.is_admin()
    or host_uid = (select auth.uid())
    or public.jsonb_participants_has_uid(coalesce(participants, '[]'::jsonb), (select auth.uid()))
  );

drop policy if exists team_sessions_insert on public.team_sessions;
create policy team_sessions_insert on public.team_sessions
  for insert with check (public.is_admin() or host_uid = (select auth.uid()));

-- O UPDATE precisa alcançar o participante: é ele quem grava `workout_state`
-- durante o treino. Entrar na sessão continua sendo só por RPC (SECURITY
-- DEFINER), que valida convite/código antes de tocar em `participants`.
drop policy if exists team_sessions_update on public.team_sessions;
create policy team_sessions_update on public.team_sessions
  for update using (
    public.is_admin()
    or host_uid = (select auth.uid())
    or public.jsonb_participants_has_uid(coalesce(participants, '[]'::jsonb), (select auth.uid()))
  );

drop policy if exists team_sessions_delete on public.team_sessions;
create policy team_sessions_delete on public.team_sessions
  for delete using (public.is_admin() or host_uid = (select auth.uid()));

-- invites: as 4 granulares de 20260707120000. O INSERT restrito a
-- `from_uid = auth.uid()` é o que impede forjar convite em nome de terceiro.
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (
    public.is_admin() or from_uid = (select auth.uid()) or to_uid = (select auth.uid())
  );

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (public.is_admin() or from_uid = (select auth.uid()));

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update using (
    public.is_admin() or from_uid = (select auth.uid()) or to_uid = (select auth.uid())
  ) with check (
    public.is_admin() or from_uid = (select auth.uid()) or to_uid = (select auth.uid())
  );

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete using (public.is_admin() or from_uid = (select auth.uid()));

-- presence: cada um cuida da própria linha; membros da sessão leem as demais.
drop policy if exists team_session_presence_select on public.team_session_presence;
create policy team_session_presence_select on public.team_session_presence
  for select using (
    public.is_admin()
    or user_id = (select auth.uid())
    or exists (
      select 1 from public.team_sessions ts
      where ts.id = team_session_presence.session_id
        and (
          ts.host_uid = (select auth.uid())
          or public.jsonb_participants_has_uid(coalesce(ts.participants, '[]'::jsonb), (select auth.uid()))
        )
    )
  );

drop policy if exists team_session_presence_write on public.team_session_presence;
create policy team_session_presence_write on public.team_session_presence
  for all using (public.is_admin() or user_id = (select auth.uid()))
  with check (public.is_admin() or user_id = (select auth.uid()));

-- chat: membership por host / presence / participants[] — cópia das policies
-- finais de 20260513111015 (select) e 20260627140000 (insert).
drop policy if exists "Members read team chat" on public.team_chat_messages;
create policy "Members read team chat" on public.team_chat_messages
  for select using (
    exists (
      select 1 from public.team_sessions ts
      where ts.id::text = team_chat_messages.session_id
        and (
          ts.host_uid = (select auth.uid())
          or exists (
            select 1 from public.team_session_presence p
            where p.session_id = ts.id and p.user_id = (select auth.uid())
          )
          or exists (
            select 1 from jsonb_array_elements(coalesce(ts.participants, '[]'::jsonb)) as e
            where (e->>'uid')::uuid = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Members insert team chat" on public.team_chat_messages;
create policy "Members insert team chat" on public.team_chat_messages
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.team_sessions ts
      where ts.id::text = team_chat_messages.session_id
        and (
          ts.host_uid = (select auth.uid())
          or exists (
            select 1 from public.team_session_presence p
            where p.session_id = ts.id and p.user_id = (select auth.uid())
          )
          or exists (
            select 1 from jsonb_array_elements(coalesce(ts.participants, '[]'::jsonb)) as e
            where (e->>'uid')::uuid = (select auth.uid())
          )
        )
    )
  );

-- ── 5) RPCs ──────────────────────────────────────────────────────────────────
-- accept_team_invite: cópia fiel de 20260711092326.
CREATE OR REPLACE FUNCTION public.accept_team_invite(invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv record;
  ts_host uuid;
  ts_status text;
  session_parts jsonb;
  display_name text;
  photo_url text;
  member jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT i.id, i.from_uid, i.to_uid, i.team_session_id, i.status, i.workout_data
  INTO inv
  FROM public.invites i
  WHERE i.id = invite_id
  FOR UPDATE;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF inv.to_uid <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invite is not pending';
  END IF;

  SELECT ts.host_uid, COALESCE(ts.status, 'active'), COALESCE(ts.participants, '[]'::jsonb)
  INTO ts_host, ts_status, session_parts
  FROM public.team_sessions ts
  WHERE ts.id = inv.team_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team session not found';
  END IF;

  IF ts_status <> 'active' THEN
    RAISE EXCEPTION 'Team session is not active';
  END IF;

  IF NOT (inv.from_uid = ts_host OR public.jsonb_participants_has_uid(session_parts, inv.from_uid)) THEN
    RAISE EXCEPTION 'Inviter is not part of this team session';
  END IF;

  SELECT p.display_name, p.photo_url
  INTO display_name, photo_url
  FROM public.profiles p
  WHERE p.id = auth.uid();

  member := jsonb_build_object(
    'uid', auth.uid()::text,
    'name', COALESCE(display_name, ''),
    'photo', photo_url
  );

  IF NOT public.jsonb_participants_has_uid(session_parts, auth.uid()) THEN
    IF jsonb_array_length(session_parts) >= 5 THEN
      RAISE EXCEPTION 'Team session is full';
    END IF;
    session_parts := session_parts || jsonb_build_array(member);
  END IF;

  UPDATE public.team_sessions SET participants = session_parts WHERE id = inv.team_session_id;
  UPDATE public.invites SET status = 'accepted' WHERE id = inv.id;

  INSERT INTO public.team_session_presence (session_id, user_id, status)
  VALUES (inv.team_session_id, auth.uid(), 'online')
  ON CONFLICT (session_id, user_id)
  DO UPDATE SET status = excluded.status, updated_at = now();

  RETURN jsonb_build_object(
    'team_session_id', inv.team_session_id,
    'host_uid', ts_host,
    'participants', session_parts,
    'workout', inv.workout_data
  );
END;
$function$;

-- leave_team_session: RECONSTRUÍDA (ver ressalva no cabeçalho).
CREATE OR REPLACE FUNCTION public.leave_team_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  ts_host uuid;
  session_parts jsonb;
  restantes jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select ts.host_uid, coalesce(ts.participants, '[]'::jsonb)
    into ts_host, session_parts
  from public.team_sessions ts
  where ts.id = p_session_id
  for update;

  if not found then
    -- Sair de sessão que já não existe não é erro: o cliente chama isto no
    -- caminho de saída, e falhar aqui deixaria a tela presa.
    return jsonb_build_object('ok', true, 'session_id', p_session_id, 'missing', true);
  end if;

  select coalesce(jsonb_agg(e), '[]'::jsonb)
    into restantes
  from jsonb_array_elements(session_parts) as e
  where (e->>'uid') is distinct from v_uid::text;

  update public.team_sessions
     set participants = restantes,
         -- Sessão sem ninguém encerra. O host sair NÃO encerra por si: o
         -- parceiro que ficou continua treinando com o histórico da sessão.
         status = case when jsonb_array_length(restantes) = 0 then 'ended' else coalesce(status, 'active') end
   where id = p_session_id;

  delete from public.team_session_presence
   where session_id = p_session_id and user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'participants', restantes,
    'ended', jsonb_array_length(restantes) = 0
  );
end;
$function$;

-- Higiene de grants (20260711092326): anon não chama RPC de dupla.
REVOKE EXECUTE ON FUNCTION public.accept_team_invite(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_team_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_team_session_by_code(text) FROM anon;

-- ── 6) Realtime ──────────────────────────────────────────────────────────────
-- postgres_changes respeita RLS: cada cliente só recebe o que suas policies
-- deixam ler.
do $$
begin
  execute 'alter publication supabase_realtime add table public.invites, public.team_sessions, public.team_session_presence, public.team_chat_messages';
exception when others then null;
end $$;
