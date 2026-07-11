-- Hardening (auditoria do professor): a RPC approve_access_request grava profiles.role=
-- 'teacher' e cria a linha em teachers, mas NÃO checava o papel do chamador internamente
-- (dependia 100% de EXECUTE estar limitado a service_role/postgres). Espelha o guard do
-- delete_teacher_cascade: se um GRANT EXECUTE for adicionado por engano, um usuário não
-- consegue mais auto-aprovar o próprio pedido. Função reproduzida VERBATIM + guard no topo.
CREATE OR REPLACE FUNCTION public.approve_access_request(p_request_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text, p_actor_role text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Guard interno: só admin ou service_role. Sem isto, a função confiava 100% no EXECUTE
  -- estar limitado a service_role — um GRANT EXECUTE acidental viraria self-approve de teacher.
  IF NOT public.is_admin() AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

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

  SELECT id INTO v_user_id
    FROM public.profiles
   WHERE email ILIKE v_email
   LIMIT 1;

  UPDATE public.access_requests
     SET status     = 'approved',
         updated_at = v_approved_at
   WHERE id = p_request_id;

  IF v_user_id IS NOT NULL THEN
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
$function$;
