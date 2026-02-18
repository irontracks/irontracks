BEGIN;

CREATE OR REPLACE FUNCTION public.delete_teacher_cascade(
  p_teacher_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_admin boolean;
  v_teacher record;
  v_teacher_user_id uuid;
  v_teacher_email text;
  v_student_user_ids uuid[];
  v_student_ids uuid[];
  v_workout_ids uuid[];
  v_exercise_ids uuid[];
  v_students_count int := 0;
  v_workouts_count int := 0;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_admin := public.is_admin();
  IF NOT v_is_admin AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_teacher FROM public.teachers WHERE id = p_teacher_id;
  IF v_teacher.id IS NULL THEN
    RAISE EXCEPTION 'Teacher not found';
  END IF;

  v_teacher_user_id := v_teacher.user_id;
  v_teacher_email := v_teacher.email;

  IF v_teacher_user_id IS NOT NULL THEN
    SELECT array_agg(s.user_id) FILTER (WHERE s.user_id IS NOT NULL)
      INTO v_student_user_ids
      FROM public.students s
      WHERE s.teacher_id = v_teacher_user_id;

    SELECT array_agg(s.id)
      INTO v_student_ids
      FROM public.students s
      WHERE s.teacher_id = v_teacher_user_id;
  END IF;

  v_student_user_ids := coalesce(v_student_user_ids, '{}'::uuid[]);
  v_student_ids := coalesce(v_student_ids, '{}'::uuid[]);
  v_students_count := coalesce(array_length(v_student_ids, 1), 0);

  IF array_length(v_student_user_ids, 1) IS NOT NULL THEN
    DELETE FROM public.workout_checkins WHERE user_id = ANY(v_student_user_ids);
    DELETE FROM public.exercise_execution_submissions WHERE student_user_id = ANY(v_student_user_ids);
  END IF;

  DELETE FROM public.assessment_photos
  WHERE assessment_id IN (
    SELECT id FROM public.assessments
    WHERE (v_teacher_user_id IS NOT NULL AND trainer_id = v_teacher_user_id)
       OR (array_length(v_student_user_ids, 1) IS NOT NULL AND student_id = ANY(v_student_user_ids))
  );

  DELETE FROM public.assessments
  WHERE (v_teacher_user_id IS NOT NULL AND trainer_id = v_teacher_user_id)
     OR (array_length(v_student_user_ids, 1) IS NOT NULL AND student_id = ANY(v_student_user_ids));

  IF v_teacher_user_id IS NOT NULL OR array_length(v_student_ids, 1) IS NOT NULL THEN
    DELETE FROM public.appointments
    WHERE (v_teacher_user_id IS NOT NULL AND coach_id = v_teacher_user_id)
       OR (array_length(v_student_ids, 1) IS NOT NULL AND student_id = ANY(v_student_ids));
  END IF;

  SELECT array_agg(w.id)
    INTO v_workout_ids
    FROM public.workouts w
    WHERE (v_teacher_user_id IS NOT NULL AND (w.user_id = v_teacher_user_id OR w.created_by = v_teacher_user_id))
       OR (array_length(v_student_user_ids, 1) IS NOT NULL AND w.user_id = ANY(v_student_user_ids));

  v_workout_ids := coalesce(v_workout_ids, '{}'::uuid[]);
  v_workouts_count := coalesce(array_length(v_workout_ids, 1), 0);

  IF array_length(v_workout_ids, 1) IS NOT NULL THEN
    SELECT array_agg(e.id)
      INTO v_exercise_ids
      FROM public.exercises e
      WHERE e.workout_id = ANY(v_workout_ids);

    v_exercise_ids := coalesce(v_exercise_ids, '{}'::uuid[]);
    IF array_length(v_exercise_ids, 1) IS NOT NULL THEN
      DELETE FROM public.sets WHERE exercise_id = ANY(v_exercise_ids);
      DELETE FROM public.exercises WHERE id = ANY(v_exercise_ids);
    END IF;

    DELETE FROM public.workouts WHERE id = ANY(v_workout_ids);
  END IF;

  IF v_teacher_user_id IS NOT NULL THEN
    DELETE FROM public.active_workout_sessions WHERE user_id = v_teacher_user_id;
    DELETE FROM public.user_settings WHERE user_id = v_teacher_user_id;
    DELETE FROM public.notifications WHERE user_id = v_teacher_user_id;
    DELETE FROM public.messages WHERE user_id = v_teacher_user_id;
    DELETE FROM public.invites WHERE from_uid = v_teacher_user_id OR to_uid = v_teacher_user_id;

    DELETE FROM public.direct_messages
    WHERE channel_id IN (
      SELECT id FROM public.direct_channels WHERE user1_id = v_teacher_user_id OR user2_id = v_teacher_user_id
    );
    DELETE FROM public.direct_channels WHERE user1_id = v_teacher_user_id OR user2_id = v_teacher_user_id;

    DELETE FROM public.marketplace_subscriptions WHERE teacher_user_id = v_teacher_user_id;
    DELETE FROM public.teacher_plans WHERE teacher_user_id = v_teacher_user_id;
    DELETE FROM public.asaas_customers WHERE user_id = v_teacher_user_id;
  END IF;

  IF array_length(v_student_ids, 1) IS NOT NULL THEN
    DELETE FROM public.students WHERE id = ANY(v_student_ids);
  END IF;

  DELETE FROM public.teachers WHERE id = p_teacher_id;

  IF v_teacher_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'user'
    WHERE id = v_teacher_user_id
      AND role = 'teacher'
      AND NOT EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = v_teacher_user_id)
      AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = v_teacher_user_id);
  END IF;

  INSERT INTO public.audit_events(actor_id, actor_email, actor_role, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    p_actor_email,
    coalesce(p_actor_role, 'admin'),
    'delete_teacher',
    'teacher',
    p_teacher_id,
    jsonb_build_object(
      'teacher_user_id', v_teacher_user_id,
      'teacher_email', v_teacher_email,
      'students_count', v_students_count,
      'workouts_count', v_workouts_count
    )
  );

  RETURN jsonb_build_object(
    'teacher_id', p_teacher_id,
    'teacher_user_id', v_teacher_user_id,
    'students_count', v_students_count,
    'workouts_count', v_workouts_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_teacher_cascade(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_teacher_cascade(uuid, uuid, text, text) TO service_role;

COMMIT;
