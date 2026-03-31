-- Migration: delete_teacher_cascade
-- Atomically removes a teacher and all associated data, logging to audit_events.
-- Called via RPC by the admin panel teacher-delete flow.

CREATE OR REPLACE FUNCTION delete_teacher_cascade(
  p_teacher_id   uuid,
  p_actor_id     uuid DEFAULT NULL,
  p_actor_email  text DEFAULT NULL,
  p_actor_role   text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id      uuid;
  v_email        text;
  v_deleted_at   timestamptz := now();
  v_report       jsonb;
BEGIN
  -- Resolve teacher's auth user_id from profiles
  SELECT user_id, email INTO v_user_id, v_email
    FROM profiles
   WHERE id = p_teacher_id;

  -- Delete dependent rows in a safe order
  DELETE FROM workout_checkins        WHERE teacher_id = p_teacher_id;
  DELETE FROM exercise_execution_submissions WHERE teacher_id = p_teacher_id;

  -- Remove teacher profile
  DELETE FROM profiles WHERE id = p_teacher_id;

  -- Remove auth user if resolved
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;

  -- Audit log
  INSERT INTO audit_events (
    actor_id, actor_email, actor_role,
    target_id, target_email,
    action, details, created_at
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role,
    p_teacher_id, v_email,
    'delete_teacher_cascade',
    jsonb_build_object('teacher_id', p_teacher_id, 'user_id', v_user_id),
    v_deleted_at
  );

  v_report := jsonb_build_object(
    'teacher_id',      p_teacher_id,
    'teacher_user_id', v_user_id,
    'deleted_at',      v_deleted_at
  );

  RETURN v_report;
END;
$$;
