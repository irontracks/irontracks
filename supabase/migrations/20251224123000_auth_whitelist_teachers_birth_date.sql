DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'birth_date'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN birth_date date;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_invite_whitelist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF lower(COALESCE(NEW.email, '')) = 'djmkapple@gmail.com' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE lower(s.email) = lower(NEW.email))
     AND NOT EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Acesso Negado: Este email não foi cadastrado.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_enforce_invite_whitelist ON auth.users;
CREATE TRIGGER t_enforce_invite_whitelist
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_whitelist();

CREATE OR REPLACE FUNCTION public.link_user_and_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name text;
  v_photo text;
  v_role text;
  v_is_teacher boolean;
  v_is_student boolean;
  v_has_teachers_user_id boolean;
BEGIN
  v_is_teacher := EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email));
  v_is_student := EXISTS (SELECT 1 FROM public.students s WHERE lower(s.email) = lower(NEW.email));

  IF lower(COALESCE(NEW.email, '')) = 'djmkapple@gmail.com' THEN
    v_role := 'admin';
  ELSIF v_is_teacher THEN
    v_role := 'teacher';
  ELSIF v_is_student THEN
    v_role := 'student';
  ELSE
    v_role := 'user';
  END IF;

  IF v_is_student THEN
    UPDATE public.students
      SET user_id = NEW.id
      WHERE lower(email) = lower(NEW.email)
        AND (user_id IS NULL OR user_id = NEW.id);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'user_id'
  ) INTO v_has_teachers_user_id;

  IF v_is_teacher AND v_has_teachers_user_id THEN
    UPDATE public.teachers
      SET user_id = NEW.id
      WHERE lower(email) = lower(NEW.email)
        AND (user_id IS NULL OR user_id = NEW.id);
  END IF;

  BEGIN
    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  EXCEPTION WHEN OTHERS THEN
    v_name := NULL;
  END;

  BEGIN
    v_photo := COALESCE(NEW.raw_user_meta_data->>'picture', NEW.raw_user_meta_data->>'avatar_url');
  EXCEPTION WHEN OTHERS THEN
    v_photo := NULL;
  END;

  INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, NEW.email), v_photo, now(), v_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
        last_seen = now(),
        role = CASE
          WHEN public.profiles.role = 'admin' THEN public.profiles.role
          WHEN EXCLUDED.role IN ('teacher','student') THEN EXCLUDED.role
          ELSE COALESCE(public.profiles.role, EXCLUDED.role)
        END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_link_student_and_profile ON auth.users;
DROP TRIGGER IF EXISTS t_link_user_and_profile ON auth.users;
CREATE TRIGGER t_link_user_and_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.link_user_and_profile();

CREATE OR REPLACE FUNCTION public.block_cancelled_teacher_login() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_has_payment_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'payment_status'
  ) INTO v_has_payment_status;

  IF v_has_payment_status AND EXISTS (
    SELECT 1
    FROM public.teachers t
    WHERE lower(t.email) = lower(NEW.email)
      AND lower(COALESCE(t.payment_status, '')) = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Conta suspensa: entre em contato com o administrador.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_block_cancelled_teacher_login ON auth.users;
CREATE TRIGGER t_block_cancelled_teacher_login
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.block_cancelled_teacher_login();
