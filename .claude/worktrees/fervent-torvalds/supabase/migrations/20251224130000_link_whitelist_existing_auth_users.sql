CREATE OR REPLACE FUNCTION public.link_teacher_profile_from_whitelist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(NEW.email, '')));
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = v_uid) THEN
    IF NEW.user_id IS NULL OR NEW.user_id = v_uid THEN
      NEW.user_id := v_uid;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, last_seen, role)
  VALUES (v_uid, NEW.email, COALESCE(NEW.name, NEW.email), now(), 'teacher')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        last_seen = now(),
        role = CASE
          WHEN public.profiles.role = 'admin' THEN public.profiles.role
          ELSE 'teacher'
        END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_link_teacher_profile_from_whitelist ON public.teachers;
CREATE TRIGGER t_link_teacher_profile_from_whitelist
BEFORE INSERT OR UPDATE OF email, user_id ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.link_teacher_profile_from_whitelist();

CREATE OR REPLACE FUNCTION public.link_student_profile_from_whitelist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(NEW.email, '')));
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = v_uid) THEN
    IF NEW.user_id IS NULL OR NEW.user_id = v_uid THEN
      NEW.user_id := v_uid;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, last_seen, role)
  VALUES (v_uid, NEW.email, COALESCE(NEW.name, NEW.email), now(), 'student')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        last_seen = now(),
        role = CASE
          WHEN public.profiles.role = 'admin' THEN public.profiles.role
          WHEN public.profiles.role = 'teacher' THEN public.profiles.role
          ELSE 'student'
        END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_link_student_profile_from_whitelist ON public.students;
CREATE TRIGGER t_link_student_profile_from_whitelist
BEFORE INSERT OR UPDATE OF email, user_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.link_student_profile_from_whitelist();

WITH target AS (
  SELECT DISTINCT ON (lower(trim(t.email)))
    t.id as teacher_id,
    lower(trim(t.email)) as email_norm
  FROM public.teachers t
  WHERE t.user_id IS NULL
    AND lower(trim(COALESCE(t.email, ''))) <> ''
  ORDER BY lower(trim(t.email)), t.created_at DESC
)
UPDATE public.teachers t
SET user_id = u.id
FROM target x
JOIN auth.users u ON lower(trim(u.email)) = x.email_norm
WHERE t.id = x.teacher_id
  AND NOT EXISTS (SELECT 1 FROM public.teachers t2 WHERE t2.user_id = u.id);

UPDATE public.students s
SET user_id = u.id
FROM auth.users u
WHERE s.user_id IS NULL
  AND lower(trim(COALESCE(s.email, ''))) <> ''
  AND lower(trim(u.email)) = lower(trim(s.email));

UPDATE public.profiles p
SET role = 'admin'
WHERE lower(trim(COALESCE(p.email, ''))) = 'djmkapple@gmail.com';

UPDATE public.profiles p
SET role = 'teacher'
WHERE p.role IS DISTINCT FROM 'admin'
  AND lower(trim(COALESCE(p.email, ''))) IN (
    SELECT lower(trim(t.email))
    FROM public.teachers t
    WHERE lower(trim(COALESCE(t.email, ''))) <> ''
  );

UPDATE public.profiles p
SET role = 'student'
WHERE p.role IS DISTINCT FROM 'admin'
  AND p.role IS DISTINCT FROM 'teacher'
  AND lower(trim(COALESCE(p.email, ''))) IN (
    SELECT lower(trim(s.email))
    FROM public.students s
    WHERE lower(trim(COALESCE(s.email, ''))) <> ''
  );

INSERT INTO public.profiles (id, email, display_name, last_seen, role)
SELECT u.id,
       u.email,
       COALESCE(t.name, u.email) as display_name,
       now() as last_seen,
       CASE WHEN lower(trim(u.email)) = 'djmkapple@gmail.com' THEN 'admin' ELSE 'teacher' END as role
FROM auth.users u
JOIN (
  SELECT DISTINCT ON (lower(trim(email))) lower(trim(email)) as email_norm, name
  FROM public.teachers
  WHERE lower(trim(COALESCE(email, ''))) <> ''
  ORDER BY lower(trim(email)), created_at DESC
) t ON t.email_norm = lower(trim(u.email))
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.profiles (id, email, display_name, last_seen, role)
SELECT u.id,
       u.email,
       COALESCE(s.name, u.email) as display_name,
       now() as last_seen,
       CASE
         WHEN lower(trim(u.email)) = 'djmkapple@gmail.com' THEN 'admin'
         WHEN EXISTS (
           SELECT 1 FROM public.teachers t2
           WHERE lower(trim(t2.email)) = lower(trim(u.email))
         ) THEN 'teacher'
         ELSE 'student'
       END as role
FROM auth.users u
JOIN public.students s ON lower(trim(s.email)) = lower(trim(u.email))
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
