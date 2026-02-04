CREATE OR REPLACE FUNCTION public.jsonb_participants_has_uid(participants jsonb, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $func$
  SELECT COALESCE(participants, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('uid', uid::text));
$func$;

ALTER TABLE public.team_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view team sessions they are part of" ON public.team_sessions;
DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.team_sessions;
DROP POLICY IF EXISTS "Participants can update sessions" ON public.team_sessions;
DROP POLICY IF EXISTS team_sessions_select ON public.team_sessions;
DROP POLICY IF EXISTS team_sessions_insert ON public.team_sessions;
DROP POLICY IF EXISTS team_sessions_update ON public.team_sessions;
DROP POLICY IF EXISTS team_sessions_delete ON public.team_sessions;

CREATE POLICY team_sessions_select
ON public.team_sessions
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR host_uid = auth.uid()
  OR public.jsonb_participants_has_uid(participants, auth.uid())
);

CREATE POLICY team_sessions_insert
ON public.team_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR host_uid = auth.uid()
);

CREATE POLICY team_sessions_update
ON public.team_sessions
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR host_uid = auth.uid()
)
WITH CHECK (
  public.is_admin() OR host_uid = auth.uid()
);

CREATE POLICY team_sessions_delete
ON public.team_sessions
FOR DELETE
TO authenticated
USING (
  public.is_admin() OR host_uid = auth.uid()
);

DROP POLICY IF EXISTS "Users can see invites sent to them" ON public.invites;
DROP POLICY IF EXISTS "Users can see invites they sent" ON public.invites;
DROP POLICY IF EXISTS "Users can send invites" ON public.invites;
DROP POLICY IF EXISTS "Users can update invites sent to them" ON public.invites;
DROP POLICY IF EXISTS invites_select ON public.invites;
DROP POLICY IF EXISTS invites_insert ON public.invites;
DROP POLICY IF EXISTS invites_update ON public.invites;
DROP POLICY IF EXISTS invites_delete ON public.invites;

CREATE POLICY invites_select
ON public.invites
FOR SELECT
TO authenticated
USING (
  public.is_admin() OR from_uid = auth.uid() OR to_uid = auth.uid()
);

CREATE POLICY invites_insert
ON public.invites
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin() OR from_uid = auth.uid()
);

CREATE POLICY invites_update
ON public.invites
FOR UPDATE
TO authenticated
USING (
  public.is_admin() OR from_uid = auth.uid() OR to_uid = auth.uid()
)
WITH CHECK (
  public.is_admin() OR from_uid = auth.uid() OR to_uid = auth.uid()
);

CREATE POLICY invites_delete
ON public.invites
FOR DELETE
TO authenticated
USING (
  public.is_admin() OR from_uid = auth.uid()
);

CREATE OR REPLACE FUNCTION public.accept_team_invite(invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  session_parts jsonb;
  display_name text;
  photo_url text;
  member jsonb;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.accept_team_invite(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid) TO authenticated;
