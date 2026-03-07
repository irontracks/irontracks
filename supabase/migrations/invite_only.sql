-- Invite-only Google Auth flow

-- Ensure students has required columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='email'
  ) THEN
    ALTER TABLE public.students ADD COLUMN email TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='user_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN user_id UUID;
  END IF;
END $$;

-- Unique index on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='students' AND indexname='students_email_unique'
  ) THEN
    CREATE UNIQUE INDEX students_email_unique ON public.students (lower(email));
  END IF;
END $$;

-- BEFORE INSERT trigger on auth.users to enforce whitelist
CREATE OR REPLACE FUNCTION public.enforce_invite_whitelist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE lower(email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Acesso Negado: Este email não foi cadastrado por um professor.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_enforce_invite_whitelist ON auth.users;
CREATE TRIGGER t_enforce_invite_whitelist
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_whitelist();

-- AFTER INSERT trigger to link student and create profile
CREATE OR REPLACE FUNCTION public.link_student_and_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name TEXT;
  v_photo TEXT;
BEGIN
  -- Link student.user_id
  UPDATE public.students SET user_id = NEW.id WHERE lower(email) = lower(NEW.email);

  -- Extract name/photo from OAuth metadata if present
  BEGIN
    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  EXCEPTION WHEN OTHERS THEN v_name := NULL; END;
  BEGIN
    v_photo := NEW.raw_user_meta_data->>'picture';
  EXCEPTION WHEN OTHERS THEN v_photo := NULL; END;

  -- Create/update profile
  INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, NEW.email), v_photo, now(), 'student')
  ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=COALESCE(EXCLUDED.display_name, public.profiles.display_name), photo_url=COALESCE(EXCLUDED.photo_url, public.profiles.photo_url), last_seen=now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_link_student_and_profile ON auth.users;
CREATE TRIGGER t_link_student_and_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.link_student_and_profile();

