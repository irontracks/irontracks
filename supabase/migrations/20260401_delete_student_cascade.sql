-- Migration: delete_student_cascade
-- Atomically removes a student and all associated data in a single transaction.
-- The caller (route.ts) is responsible for deleting auth.users after this returns.

CREATE OR REPLACE FUNCTION delete_student_cascade(
  p_student_id   uuid,
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
  v_user_id     uuid;
  v_email       text;
  v_deleted_at  timestamptz := now();
BEGIN
  -- Resolve the student's auth user_id and email
  SELECT user_id, email
    INTO v_user_id, v_email
    FROM public.students
   WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: %', p_student_id;
  END IF;

  -- ── Delete dependent data (order matters for FK constraints) ────────────────

  IF v_user_id IS NOT NULL THEN
    -- Checkins and submissions
    DELETE FROM public.workout_checkins             WHERE user_id        = v_user_id;
    DELETE FROM public.exercise_execution_submissions WHERE student_user_id = v_user_id;

    -- Assessments
    DELETE FROM public.assessment_photos
     WHERE assessment_id IN (
       SELECT id FROM public.assessments WHERE student_id = v_user_id
     );
    DELETE FROM public.assessments WHERE student_id = v_user_id;

    -- Workouts tree: sets → exercises → workouts
    DELETE FROM public.sets
     WHERE exercise_id IN (
       SELECT e.id FROM public.exercises e
        WHERE e.workout_id IN (
          SELECT id FROM public.workouts WHERE user_id = v_user_id
        )
     );
    DELETE FROM public.exercises
     WHERE workout_id IN (
       SELECT id FROM public.workouts WHERE user_id = v_user_id
     );
    DELETE FROM public.workouts WHERE user_id = v_user_id;

    -- Misc per-user tables
    DELETE FROM public.notifications          WHERE user_id = v_user_id;
    DELETE FROM public.user_settings          WHERE user_id = v_user_id;
    DELETE FROM public.active_workout_sessions WHERE user_id = v_user_id;

    -- Direct messages
    DELETE FROM public.direct_messages
     WHERE channel_id IN (
       SELECT id FROM public.direct_channels
        WHERE user1_id = v_user_id
           OR user2_id = v_user_id
     );
    DELETE FROM public.direct_channels
     WHERE user1_id = v_user_id
        OR user2_id = v_user_id;
  END IF;

  -- Remove student record
  DELETE FROM public.students WHERE id = p_student_id;

  -- Audit log
  INSERT INTO public.audit_events (
    actor_id, actor_email, actor_role,
    target_id, target_email,
    action, details, created_at
  ) VALUES (
    p_actor_id, p_actor_email, p_actor_role,
    p_student_id, v_email,
    'delete_student_cascade',
    jsonb_build_object(
      'student_id',      p_student_id,
      'student_user_id', v_user_id
    ),
    v_deleted_at
  );

  RETURN jsonb_build_object(
    'student_id',      p_student_id,
    'student_user_id', v_user_id,
    'deleted_at',      v_deleted_at
  );
END;
$$;
