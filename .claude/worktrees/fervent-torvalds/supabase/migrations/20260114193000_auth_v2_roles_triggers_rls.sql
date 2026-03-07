BEGIN;

-- Admin emails registry (avoids hardcoding in multiple places)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email text PRIMARY KEY
);

DO $$ BEGIN
  INSERT INTO public.admin_emails (email)
  VALUES (lower('djmkapple@gmail.com'))
  ON CONFLICT (email) DO NOTHING;
END $$;

-- Ensure profiles has required columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'student';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN last_seen timestamptz;
  END IF;
END $$;

-- Role bootstrap trigger
CREATE OR REPLACE FUNCTION public.link_user_and_profile_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text := 'student';
  v_name text;
  v_photo text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = lower(COALESCE(NEW.email,''))) THEN
    v_role := 'admin';
  ELSIF EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email)) THEN
    v_role := 'teacher';
  END IF;

  BEGIN
    v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name');
  EXCEPTION WHEN OTHERS THEN v_name := NULL; END;
  BEGIN
    v_photo := COALESCE(NEW.raw_user_meta_data->>'picture', NEW.raw_user_meta_data->>'avatar_url');
  EXCEPTION WHEN OTHERS THEN v_photo := NULL; END;

  INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role)
  VALUES (NEW.id, NEW.email, COALESCE(v_name, NEW.email), v_photo, now(), v_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        photo_url = COALESCE(EXCLUDED.photo_url, public.profiles.photo_url),
        last_seen = now(),
        role = CASE
          WHEN public.profiles.role = 'admin' THEN public.profiles.role
          ELSE COALESCE(public.profiles.role, EXCLUDED.role)
        END;

  -- Link students/teachers by email
  UPDATE public.students SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);
  UPDATE public.teachers SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);

  RETURN NEW;
END;
$$;

-- Invite-only (teachers/students/admin emails)
CREATE OR REPLACE FUNCTION public.enforce_invite_whitelist_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = lower(COALESCE(NEW.email,''))) THEN
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
FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_whitelist_v2();

DROP TRIGGER IF EXISTS t_link_user_and_profile ON auth.users;
CREATE TRIGGER t_link_user_and_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.link_user_and_profile_v2();

-- RLS policies (minimal)
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
  DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
  DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
END $$;
CREATE POLICY profiles_select_self ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMIT;
