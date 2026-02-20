BEGIN;

CREATE OR REPLACE FUNCTION public.link_user_and_profile_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text := 'student';
  v_name text;
  v_photo text;
  v_approved boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = lower(COALESCE(NEW.email,''))) THEN
    v_role := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email)) THEN
    v_role := 'teacher';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.access_requests ar
    WHERE lower(ar.email) = lower(COALESCE(NEW.email,''))
      AND ar.status = 'accepted'
  ) THEN
    v_approved := true;
  END IF;

  BEGIN
    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  EXCEPTION WHEN OTHERS THEN v_name := NULL; END;
  BEGIN
    v_photo := COALESCE(NEW.raw_user_meta_data->>'picture', NEW.raw_user_meta_data->>'avatar_url');
  EXCEPTION WHEN OTHERS THEN v_photo := NULL; END;

  INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role, is_approved)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, NEW.email), v_photo, now(), v_role, v_approved)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
        last_seen = now(),
        role = CASE
          WHEN public.profiles.role = 'admin' THEN public.profiles.role
          ELSE COALESCE(public.profiles.role, EXCLUDED.role)
        END,
        is_approved = CASE
          WHEN public.profiles.is_approved THEN true
          ELSE COALESCE(public.profiles.is_approved, EXCLUDED.is_approved)
        END;

  UPDATE public.students SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);
  UPDATE public.teachers SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);

  RETURN NEW;
END;
$$;

COMMIT;

