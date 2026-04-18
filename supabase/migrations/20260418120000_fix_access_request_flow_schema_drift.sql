-- Fix schema drift between code and DB for the access-request approval flow.
--
-- Problems:
-- 1. handle_new_user() inserts into profiles.created_at / updated_at — columns that don't
--    exist in profiles. Every new signup via supabase.auth.signUp() fails with
--    "Database error saving new user".
-- 2. approve_access_request() updates access_requests.metadata — column doesn't exist.
--    Admin approve flow crashes when the user hasn't signed up yet (pre-approval).
-- 3. approve_access_request() inserts into audit_events using columns (target_id,
--    target_email, details) that don't exist. Actual columns are (entity_type,
--    entity_id, metadata).
--
-- Real schemas (checked via information_schema):
--   profiles: id, email, display_name, photo_url, last_seen, role, is_approved,
--             approval_status, approved_at, approved_by, referral_code
--   access_requests: id, email, phone, full_name, birth_date, status, created_at,
--                    updated_at, role_requested, cref
--   audit_events: id, created_at, actor_id, actor_email, actor_role, action,
--                 entity_type, entity_id, metadata

-- ──────────────────────────────────────────────────────────────────────────────
-- Fix 1: handle_new_user trigger — remove nonexistent created_at/updated_at
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name  text;
  v_role          text    := 'user';
  v_is_approved   boolean := false;
  v_role_req      text;
BEGIN
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'),    ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'),         ''),
    split_part(NEW.email, '@', 1)
  );

  -- Pre-approved access_request (admin approved before account existed)
  SELECT role_requested
    INTO v_role_req
    FROM public.access_requests
   WHERE email  = NEW.email
     AND status = 'approved'
   LIMIT 1;

  IF v_role_req IS NOT NULL THEN
    v_role        := CASE WHEN v_role_req = 'teacher' THEN 'teacher' ELSE 'user' END;
    v_is_approved := true;
  END IF;

  INSERT INTO public.profiles (
    id, email, display_name, role, is_approved
  ) VALUES (
    NEW.id, NEW.email, v_display_name, v_role, v_is_approved
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_is_approved AND v_role = 'teacher' THEN
    UPDATE public.teachers
       SET user_id = NEW.id
     WHERE email ILIKE NEW.email
       AND user_id IS NULL;
  END IF;

  IF v_is_approved AND v_role <> 'teacher' THEN
    UPDATE public.students
       SET user_id = NEW.id
     WHERE email ILIKE NEW.email
       AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Fix 2+3: approve_access_request — remove metadata UPDATE, fix audit_events INSERT
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_access_request(
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
  -- Lock request row to prevent two admins from approving concurrently
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

  -- Mark request as approved
  UPDATE public.access_requests
     SET status     = 'approved',
         updated_at = v_approved_at
   WHERE id = p_request_id;

  IF v_user_id IS NOT NULL THEN
    -- ── User already has an account ──────────────────────────────────────────

    IF v_role = 'teacher' THEN
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

      UPDATE public.profiles
         SET role            = 'teacher',
             is_approved     = true,
             approval_status = 'approved',
             approved_at     = v_approved_at,
             approved_by     = p_actor_id
       WHERE id = v_user_id;

    ELSE
      UPDATE public.profiles
         SET is_approved     = true,
             approval_status = 'approved',
             approved_at     = v_approved_at,
             approved_by     = p_actor_id
       WHERE id = v_user_id;

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
    -- The handle_new_user trigger reads access_requests.status='approved' + role_requested
    -- directly, so no metadata column update is needed (previous RPC referenced a
    -- nonexistent `metadata` column — removed).

    -- Create teacher record without user_id so it's visible in admin panel
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

  -- Audit log — uses real audit_events schema (entity_type, entity_id, metadata)
  INSERT INTO public.audit_events (
    actor_id, actor_email, actor_role,
    entity_type, entity_id,
    action, metadata, created_at
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role,
    'access_request', p_request_id,
    'approve_access_request',
    jsonb_build_object(
      'request_id',      p_request_id,
      'role',            v_role,
      'user_id',         v_user_id,
      'account_existed', v_user_id IS NOT NULL,
      'email',           v_email,
      'full_name',       v_full_name
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
