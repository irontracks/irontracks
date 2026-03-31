-- Migration: auth_profile_trigger
-- Creates a profile row automatically when a user signs up via Supabase Auth.
-- Also links pre-approved access_requests (admin approved before account existed).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name  text;
  v_role          text  := 'user';
  v_is_approved   boolean := false;
  v_meta          jsonb;
BEGIN
  -- Build display name from auth metadata
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'),    ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'),         ''),
    split_part(NEW.email, '@', 1)
  );

  -- Check for a pre-approved access_request (admin approved before account was created)
  SELECT metadata
    INTO v_meta
    FROM public.access_requests
   WHERE email  = NEW.email
     AND status = 'approved'
     AND (metadata->>'pre_approved')::boolean = true
   LIMIT 1;

  IF v_meta IS NOT NULL THEN
    v_role        := COALESCE(NULLIF(v_meta->>'role', ''), 'user');
    v_is_approved := true;
  END IF;

  -- Create the profile (idempotent — ON CONFLICT DO NOTHING for re-runs)
  INSERT INTO public.profiles (
    id, email, display_name, role, is_approved, created_at, updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    v_role,
    v_is_approved,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- If pre-approved as teacher: link the teacher record that was created without user_id
  IF v_is_approved AND v_role = 'teacher' THEN
    UPDATE public.teachers
       SET user_id = NEW.id
     WHERE email ILIKE NEW.email
       AND user_id IS NULL;
  END IF;

  -- If pre-approved as student: link the student record
  IF v_is_approved AND v_role <> 'teacher' THEN
    UPDATE public.students
       SET user_id = NEW.id
     WHERE email ILIKE NEW.email
       AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (drop first to be idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
