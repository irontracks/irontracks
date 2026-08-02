-- Corrige a exclusão de alunos após o schema de audit_events mudar e garante
-- que dados sem FK, objetos do Storage e auth.users sejam tratados pelo fluxo.

CREATE OR REPLACE FUNCTION public.get_student_deletion_plan(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_storage_objects jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT s.user_id
    INTO v_user_id
    FROM public.students s
   WHERE s.id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: %', p_student_id;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object('bucket_id', o.bucket_id, 'name', o.name)
      ORDER BY o.bucket_id, o.name
    ),
    '[]'::jsonb
  )
    INTO v_storage_objects
    FROM storage.objects o
   WHERE v_user_id IS NOT NULL
     AND (
       o.owner = v_user_id
       OR o.owner_id = v_user_id::text
       OR o.name LIKE v_user_id::text || '/%'
       OR (
         o.bucket_id = 'chat-media'
         AND EXISTS (
           SELECT 1
             FROM public.direct_channels dc
            WHERE (dc.user1_id = v_user_id OR dc.user2_id = v_user_id)
              AND o.name LIKE dc.id::text || '/%'
         )
       )
     );

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'student_user_id', v_user_id,
    'storage_objects', v_storage_objects
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_student_deletion_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_deletion_plan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_student_cascade(
  p_student_id uuid,
  p_actor_id uuid DEFAULT NULL,
  p_actor_email text DEFAULT NULL,
  p_actor_role text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_student_ids uuid[];
  v_deleted_at timestamptz := now();
  v_students_deleted integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT s.user_id
    INTO v_user_id
    FROM public.students s
   WHERE s.id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STUDENT_NOT_FOUND: %', p_student_id;
  END IF;

  -- A rota deve excluir auth.users antes desta etapa. Assim, FKs CASCADE
  -- limpam o grosso dos dados e uma falha final continua recuperável.
  IF v_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id) THEN
    RAISE EXCEPTION 'AUTH_USER_STILL_EXISTS: %', v_user_id;
  END IF;

  SELECT coalesce(array_agg(s.id), '{}'::uuid[])
    INTO v_student_ids
    FROM public.students s
   WHERE s.id = p_student_id
      OR (v_user_id IS NOT NULL AND s.user_id = v_user_id);

  -- Registros que não possuem FK CASCADE para auth.users/profiles/students.
  DELETE FROM public.appointments
   WHERE student_id = ANY(v_student_ids);

  IF v_user_id IS NOT NULL THEN
    DELETE FROM public.body_photo_assessment_photos WHERE user_id = v_user_id;
    DELETE FROM public.lab_exam_files WHERE user_id = v_user_id;
    DELETE FROM public.notifications
     WHERE user_id = v_user_id OR recipient_id = v_user_id OR sender_id = v_user_id;
    DELETE FROM public.student_charges WHERE student_user_id = v_user_id;
    DELETE FROM public.student_diet_plans WHERE user_id = v_user_id;
    DELETE FROM public.student_subscriptions WHERE student_user_id = v_user_id;
    DELETE FROM public.user_activity_events WHERE user_id = v_user_id;
    DELETE FROM public.error_reports WHERE user_id = v_user_id;
  END IF;

  DELETE FROM public.students WHERE id = ANY(v_student_ids);
  GET DIAGNOSTICS v_students_deleted = ROW_COUNT;

  INSERT INTO public.audit_events (
    actor_id,
    actor_email,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    p_actor_id,
    p_actor_email,
    coalesce(p_actor_role, 'admin'),
    'delete_student',
    'student',
    p_student_id,
    jsonb_build_object(
      'student_user_id', v_user_id,
      'student_rows_deleted', v_students_deleted
    )
  );

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'student_user_id', v_user_id,
    'student_rows_deleted', v_students_deleted,
    'deleted_at', v_deleted_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_student_cascade(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_cascade(uuid, uuid, text, text) TO service_role;
