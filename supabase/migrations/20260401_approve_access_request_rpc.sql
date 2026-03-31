-- Migration: approve_access_request_rpc
-- Atomically approves an access_request and creates/links all dependent records.
-- Called via RPC by the admin panel Solicitações tab accept flow.

CREATE OR REPLACE FUNCTION approve_access_request(
  p_request_id   uuid,
  p_actor_id     uuid DEFAULT NULL,
  p_actor_email  text DEFAULT NULL,
  p_actor_role   text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request       RECORD;
  v_teacher_id    uuid;
  v_student_id    uuid;
  v_user_id       uuid;
  v_email         text;
  v_full_name     text;
  v_role          text;
  v_approved_at   timestamptz := now();
BEGIN
  -- Lock the row to prevent two admins from approving the same request concurrently
  SELECT * INTO v_request
    FROM public.access_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: %', p_request_id;
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING: status is ''%''', v_request.status;
  END IF;

  v_email     := COALESCE(TRIM(v_request.email), '');
  v_full_name := COALESCE(NULLIF(TRIM(v_request.full_name), ''), split_part(v_email, '@', 1));
  v_role      := COALESCE(NULLIF(TRIM(v_request.role_requested), ''), 'student');

  -- Look up the auth user id via profiles (created by trigger on signup)
  SELECT id INTO v_user_id
    FROM public.profiles
   WHERE email ILIKE v_email
   LIMIT 1;

  -- Mark the request as approved
  UPDATE public.access_requests
     SET status     = 'approved',
         updated_at = v_approved_at
   WHERE id = p_request_id;

  IF v_user_id IS NOT NULL THEN
    -- ── User already has an account ──────────────────────────────────────────

    IF v_role = 'teacher' THEN
      -- Upsert teacher record
      SELECT id INTO v_teacher_id
        FROM public.teachers
       WHERE email ILIKE v_email
       LIMIT 1;

      IF v_teacher_id IS NULL THEN
        INSERT INTO public.teachers (email, name, phone, user_id, status, birth_date)
        VALUES (v_email, v_full_name, v_request.phone, v_user_id, 'active', v_request.birth_date)
        RETURNING id INTO v_teacher_id;
      ELSE
        UPDATE public.teachers
           SET user_id = v_user_id,
               status  = 'active'
         WHERE id = v_teacher_id;
      END IF;

      -- Promote profile to teacher role
      UPDATE public.profiles
         SET role            = 'teacher',
             is_approved     = true,
             approval_status = 'approved',
             approved_at     = v_approved_at,
             approved_by     = p_actor_id
       WHERE id = v_user_id;

    ELSE
      -- Approve profile as student
      UPDATE public.profiles
         SET is_approved     = true,
             approval_status = 'approved',
             approved_at     = v_approved_at,
             approved_by     = p_actor_id
       WHERE id = v_user_id;

      -- Upsert student record
      SELECT id INTO v_student_id
        FROM public.students
       WHERE email ILIKE v_email
       LIMIT 1;

      IF v_student_id IS NULL THEN
        INSERT INTO public.students (email, name, user_id, status)
        VALUES (v_email, v_full_name, v_user_id, 'ativo')
        RETURNING id INTO v_student_id;
      ELSE
        UPDATE public.students
           SET user_id = v_user_id,
               status  = 'ativo'
         WHERE id = v_student_id;
      END IF;
    END IF;

  ELSE
    -- ── No account yet — pre-approve for when they sign up ───────────────────
    -- The handle_new_user trigger will read this metadata and auto-approve.
    UPDATE public.access_requests
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'pre_approved', true,
             'role',         v_role,
             'approved_at',  v_approved_at::text,
             'approved_by',  p_actor_id::text
           )
     WHERE id = p_request_id;

    -- Create teacher record without user_id so it's visible in the admin panel
    IF v_role = 'teacher' THEN
      SELECT id INTO v_teacher_id
        FROM public.teachers
       WHERE email ILIKE v_email
       LIMIT 1;

      IF v_teacher_id IS NULL THEN
        INSERT INTO public.teachers (email, name, phone, status, birth_date)
        VALUES (v_email, v_full_name, v_request.phone, 'active', v_request.birth_date)
        RETURNING id INTO v_teacher_id;
      ELSE
        UPDATE public.teachers SET status = 'active' WHERE id = v_teacher_id;
      END IF;
    END IF;
  END IF;

  -- Audit log
  INSERT INTO public.audit_events (
    actor_id, actor_email, actor_role,
    target_id, target_email,
    action, details, created_at
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role,
    p_request_id, v_email,
    'approve_access_request',
    jsonb_build_object(
      'request_id',      p_request_id,
      'role',            v_role,
      'user_id',         v_user_id,
      'account_existed', v_user_id IS NOT NULL
    ),
    v_approved_at
  );

  RETURN jsonb_build_object(
    'user_id',         v_user_id,
    'email',           v_email,
    'full_name',       v_full_name,
    'role',            v_role,
    'account_existed', v_user_id IS NOT NULL,
    'approved_at',     v_approved_at
  );
END;
$$;
