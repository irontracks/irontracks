-- accept_team_invite era SECURITY DEFINER executável por anon. A checagem
-- `inv.to_uid <> auth.uid()` falhava com lógica NULL para caller anônimo
-- (auth.uid() = NULL → condição NULL → exceção não disparava), deixando um
-- anônimo aceitar/consumir convites pelo invite_id. Auditoria 2026-06-27 (advisor).
-- Correção: (1) guard explícito de sessão no topo; (2) REVOKE de anon/public.
-- Aplicada em produção via MCP.

CREATE OR REPLACE FUNCTION public.accept_team_invite(invite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv record;
  session_parts jsonb;
  display_name text;
  photo_url text;
  member jsonb;
BEGIN
  -- Defense-in-depth: rejeita caller sem sessão (anon). Sem isto, a checagem
  -- abaixo (to_uid <> auth.uid()) ficava NULL e era ignorada.
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

  SELECT COALESCE(ts.participants, '[]'::jsonb)
  INTO session_parts
  FROM public.team_sessions ts
  WHERE ts.id = inv.team_session_id
  FOR UPDATE;

  IF session_parts IS NULL THEN
    RAISE EXCEPTION 'Team session not found';
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

REVOKE EXECUTE ON FUNCTION public.accept_team_invite(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated;
