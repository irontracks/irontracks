-- Auditoria do treino em dupla (2026-07-11) — 2 itens de higiene:
--
--   #7 — accept_team_invite não checava se a sessão ainda está ativa. Aceitar um
--     convite pendente de uma sessão já 'ended' inseria o usuário numa sessão
--     morta (fantasma). Agora rejeita quando status <> 'active'. (Mantém as travas
--     do #314: emissor precisa pertencer à sessão + limite de 5 no servidor.)
--
--   F6 — higiene de grants: revoga EXECUTE de `anon` nas RPCs de dupla (já
--     null-checam auth.uid(), mas não há motivo pra anon chamá-las) e da função
--     de trigger invites_create_notification (não deve ser chamável via /rpc).

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

  -- #7: não entrar numa sessão encerrada.
  IF ts_status <> 'active' THEN
    RAISE EXCEPTION 'Team session is not active';
  END IF;

  -- F1 (#314): o emissor do convite precisa ser host ou participante da sessão.
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

-- F6 — revoga EXECUTE de anon nas RPCs (defesa em profundidade; já rejeitam anon).
REVOKE EXECUTE ON FUNCTION public.join_team_session_by_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_team_session(uuid) FROM anon;
-- Função de trigger — nunca deve ser chamada diretamente via /rpc. Revoga de
-- PUBLIC (grant padrão de função) além de anon/authenticated; o trigger continua
-- disparando normalmente (não depende de EXECUTE do chamador).
REVOKE EXECUTE ON FUNCTION public.invites_create_notification() FROM PUBLIC, anon, authenticated;
