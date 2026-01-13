BEGIN;

DO $$
DECLARE
  inst uuid;
BEGIN
  SELECT instance_id INTO inst FROM auth.users LIMIT 1;
  IF inst IS NULL THEN
    RAISE EXCEPTION 'missing_auth_instance';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    is_sso_user
  ) VALUES
    (inst, '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher1@test.local', '$2a$10$CwTycUXWue0Thq9StjUM0uJ8s9H9n1tFoZT3zh7ElBTtPlqvGjuf6', now(), '', '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false),
    (inst, '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher2@test.local', '$2a$10$CwTycUXWue0Thq9StjUM0uJ8s9H9n1tFoZT3zh7ElBTtPlqvGjuf6', now(), '', '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false),
    (inst, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'student1@test.local', '$2a$10$CwTycUXWue0Thq9StjUM0uJ8s9H9n1tFoZT3zh7ElBTtPlqvGjuf6', now(), '', '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false),
    (inst, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'student2@test.local', '$2a$10$CwTycUXWue0Thq9StjUM0uJ8s9H9n1tFoZT3zh7ElBTtPlqvGjuf6', now(), '', '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now(), false)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
END $$;

INSERT INTO public.students (id, teacher_id, user_id, name, email)
VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Student 1', 'student1@test.local'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Student 2', 'student2@test.local')
ON CONFLICT (id) DO UPDATE SET
  teacher_id = EXCLUDED.teacher_id,
  user_id = EXCLUDED.user_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email;

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

DO $$
DECLARE
  wid uuid;
BEGIN
  SELECT public.save_workout_atomic(
    NULL,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    true,
    'Treino A',
    '',
    '[{"name":"Supino","notes":"","rest_time":60,"video_url":"","method":"Normal","cadence":"2020","order":0,"sets":[{"weight":10,"reps":"10","rpe":8,"set_number":1,"completed":false}]}]'::jsonb
  ) INTO wid;
  IF wid IS NULL THEN
    RAISE EXCEPTION 'expected_workout_id';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM public.save_workout_atomic(
      NULL,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      false,
      'Histórico Indevido',
      '',
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected_failure_teacher_history_insert';
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

DO $$
DECLARE
  c bigint;
BEGIN
  SELECT count(*) INTO c FROM public.workouts WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF COALESCE(c, 0) <> 0 THEN
    RAISE EXCEPTION 'expected_zero_rows_teacher_cross_silo_select';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

DO $$
DECLARE
  wid uuid;
BEGIN
  SELECT public.save_workout_atomic(
    NULL,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    true,
    'Meu Template',
    '',
    '[]'::jsonb
  ) INTO wid;
  IF wid IS NULL THEN
    RAISE EXCEPTION 'expected_student_template_insert';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.workouts
    SET name = 'Tentativa de editar template do professor'
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND created_by = '11111111-1111-1111-1111-111111111111'
      AND is_template = true;
    IF FOUND THEN
      RAISE EXCEPTION 'expected_failure_student_edit_teacher_template';
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

ROLLBACK;
