BEGIN;

-- Ensure admin role can upgrade existing profiles (not only preserve)
CREATE OR REPLACE FUNCTION public.link_user_and_profile_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email text;
  v_role text := 'student';
  v_name text;
  v_photo text;
BEGIN
  v_email := lower(COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', ''));

  IF EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = v_email) THEN
    v_role := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = v_email) THEN
    v_role := 'teacher';
  END IF;

  BEGIN
    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  EXCEPTION WHEN OTHERS THEN v_name := NULL; END;
  BEGIN
    v_photo := COALESCE(NEW.raw_user_meta_data->>'picture', NEW.raw_user_meta_data->>'avatar_url');
  EXCEPTION WHEN OTHERS THEN v_photo := NULL; END;

  INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role)
  VALUES (NEW.id, v_email, COALESCE(v_name, v_email), v_photo, now(), v_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
        last_seen = now(),
        role = CASE
          WHEN EXCLUDED.role = 'admin' THEN 'admin'
          WHEN public.profiles.role = 'admin' THEN 'admin'
          ELSE COALESCE(public.profiles.role, EXCLUDED.role)
        END;

  UPDATE public.students SET user_id = NEW.id WHERE lower(email) = v_email AND (user_id IS NULL OR user_id = NEW.id);
  UPDATE public.teachers SET user_id = NEW.id WHERE lower(email) = v_email AND (user_id IS NULL OR user_id = NEW.id);

  RETURN NEW;
END;
$$;

-- Backfill: any profile with email in admin_emails becomes admin
UPDATE public.profiles p
SET role = 'admin'
FROM public.admin_emails a
WHERE a.email = lower(COALESCE(p.email, ''))
  AND p.role IS DISTINCT FROM 'admin';

COMMIT;

