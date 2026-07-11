-- Auditoria do treino em dupla (2026-07-11) — fecha 2 falhas de autorização nas
-- RPCs SECURITY DEFINER de sessão em dupla:
--
--   F1 (CRÍTICO) — auto-convite forjado → entrar em sessão privada alheia.
--     A policy invites_insert só valida from_uid=auth.uid() (não restringe to_uid
--     nem team_session_id), e accept_team_invite nunca validava que o EMISSOR do
--     convite pertence à sessão. Vetor: um usuário insere um convite pra si mesmo
--     (to_uid = auth.uid()) apontando pra QUALQUER team_session_id conhecido e o
--     aceita → vira participante → lê todo o chat/presença e injeta mensagens.
--     Correção: accept_team_invite passa a exigir que inv.from_uid seja o host OU
--     um participante da sessão.
--
--   Limite de 5 participantes (MAX_TEAM_PARTICIPANTS) — antes só existia no
--     cliente; nem accept_team_invite nem join_team_session_by_code checavam a
--     contagem, então corrida (dois aceites simultâneos) ou entrada por código
--     furava o limite. Correção: as duas RPCs validam a contagem sob FOR UPDATE.

CREATE OR REPLACE FUNCTION public.accept_team_invite(invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv record;
  ts_host uuid;
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

  SELECT ts.host_uid, COALESCE(ts.participants, '[]'::jsonb)
  INTO ts_host, session_parts
  FROM public.team_sessions ts
  WHERE ts.id = inv.team_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team session not found';
  END IF;

  -- SEGURANÇA (F1): o EMISSOR do convite precisa ser o host ou um participante da
  -- sessão. Sem isto, um auto-convite forjado dava acesso a sessão alheia.
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
    -- Limite de participantes no SERVIDOR (corrida-safe via FOR UPDATE acima).
    IF jsonb_array_length(session_parts) >= 5 THEN
      RAISE EXCEPTION 'Team session is full';
    END IF;
    session_parts := session_parts || jsonb_build_array(member);
  END IF;

  UPDATE public.team_sessions
  SET participants = session_parts
  WHERE id = inv.team_session_id;

  UPDATE public.invites
  SET status = 'accepted'
  WHERE id = invite_id;

  RETURN jsonb_build_object(
    'team_session_id', inv.team_session_id,
    'participants', session_parts,
    'workout', inv.workout_data
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_team_session_by_code(code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid;
  v_code text;
  ts_id uuid;
  ts_host uuid;
  session_parts jsonb;
  ts_state jsonb;
  display_name text;
  photo_url text;
  member jsonb;
  workout_payload jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_code := nullif(btrim(code), '');
  if v_code is null then
    raise exception 'Invalid code';
  end if;

  -- Lock the session row to avoid race conditions when multiple users join
  select ts.id, ts.host_uid, coalesce(ts.participants, '[]'::jsonb)
       , coalesce(ts.workout_state, '{}'::jsonb)
    into ts_id, ts_host, session_parts, ts_state
  from public.team_sessions ts
  where coalesce(ts.status, 'active') = 'active'
    and lower(coalesce(ts.workout_state->>'join_code', ts.workout_state->>'joinCode', '')) = lower(v_code)
    and (
      nullif(coalesce(ts.workout_state->>'join_expires_at', ts.workout_state->>'joinExpiresAt', ''), '') is null
      or (coalesce(ts.workout_state->>'join_expires_at', ts.workout_state->>'joinExpiresAt'))::timestamptz > now()
    )
  order by ts.created_at desc
  limit 1
  for update;

  if ts_id is null then
    raise exception 'Invalid or expired code';
  end if;

  select p.display_name, p.photo_url
    into display_name, photo_url
  from public.profiles p
  where p.id = v_uid;

  member := jsonb_build_object(
    'uid', v_uid::text,
    'name', coalesce(display_name, ''),
    'photo', photo_url
  );

  if not public.jsonb_participants_has_uid(session_parts, v_uid) then
    -- Limite de participantes no SERVIDOR (corrida-safe via FOR UPDATE acima).
    if jsonb_array_length(session_parts) >= 5 then
      raise exception 'Team session is full';
    end if;
    session_parts := session_parts || jsonb_build_array(member);
  end if;

  update public.team_sessions
    set participants = session_parts
  where id = ts_id;

  -- Mark presence as online (idempotent)
  insert into public.team_session_presence (session_id, user_id, status)
  values (ts_id, v_uid, 'online')
  on conflict (session_id, user_id)
  do update set status = excluded.status, updated_at = now();

  workout_payload := coalesce(ts_state->'workout_data', ts_state->'workout');

  return jsonb_build_object(
    'team_session_id', ts_id,
    'host_uid', ts_host,
    'participants', session_parts,
    'workout', workout_payload
  );
end;
$function$;
