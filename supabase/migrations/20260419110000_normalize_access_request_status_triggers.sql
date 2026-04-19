-- Normalize the three auth.users triggers to accept both 'approved' (canonical
-- post-20260401) and 'accepted' (legacy) as synonyms, and fix the is_approved
-- preservation bug in link_user_and_profile_v2.
--
-- Problems observed during Phase 3 signup E2E:
--
-- 1. enforce_invite_whitelist_v2 accepted only 'pending' or 'accepted' — NOT
--    'approved'. That means a user approved via the new approve_access_request
--    RPC (which sets status='approved') couldn't sign up because the BEFORE
--    trigger rejected them with "Acesso Negado".
--
-- 2. handle_new_user read only status='approved'; link_user_and_profile_v2
--    read only status='accepted'. Whichever wasn't used by the current admin
--    flow left the profile with is_approved=false.
--
-- 3. link_user_and_profile_v2's ON CONFLICT preserved the existing is_approved
--    value whenever it was falsy (CASE WHEN public.profiles.is_approved THEN
--    true ELSE COALESCE(existing, EXCLUDED)). Since handle_new_user runs first
--    and writes is_approved=false, the v2 trigger could never upgrade it —
--    leaving legitimately approved users stuck in wait-approval.
--
-- Fix: all three triggers now treat 'approved' and 'accepted' as synonyms,
-- and link_user_and_profile_v2 uses OR semantics so is_approved flips to
-- true as soon as any path detects approval, without losing "once true,
-- always true".

-- ── 1. enforce_invite_whitelist_v2: accept 'approved' too ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_invite_whitelist_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = lower(COALESCE(NEW.email,''))) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.access_requests ar
    WHERE lower(ar.email) = lower(COALESCE(NEW.email,''))
      AND ar.status IN ('pending', 'accepted', 'approved')
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE lower(s.email) = lower(NEW.email))
     AND NOT EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Acesso Negado: Este email não foi cadastrado.';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. handle_new_user: accept both 'approved' and 'accepted' ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_name  text;
  v_role          text    := 'user';
  v_is_approved   boolean := false;
  v_role_req      text;
BEGIN
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'),    ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'),         ''),
    split_part(NEW.email, '@', 1)
  );

  -- Pre-approved access_request (admin approved before account existed).
  -- Accept both canonical 'approved' and legacy 'accepted' as synonyms.
  SELECT role_requested
    INTO v_role_req
    FROM public.access_requests
   WHERE email  = NEW.email
     AND status IN ('approved', 'accepted')
   LIMIT 1;

  IF v_role_req IS NOT NULL THEN
    v_role        := CASE WHEN v_role_req = 'teacher' THEN 'teacher' ELSE 'user' END;
    v_is_approved := true;
  END IF;

  INSERT INTO public.profiles (
    id, email, display_name, role, is_approved
  ) VALUES (
    NEW.id, NEW.email, v_display_name, v_role, v_is_approved
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_is_approved AND v_role = 'teacher' THEN
    UPDATE public.teachers
       SET user_id = NEW.id
     WHERE email ILIKE NEW.email
       AND user_id IS NULL;
  END IF;

  IF v_is_approved AND v_role <> 'teacher' THEN
    UPDATE public.students
       SET user_id = NEW.id
     WHERE email ILIKE NEW.email
       AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. link_user_and_profile_v2: accept both statuses + OR-merge is_approved ──
CREATE OR REPLACE FUNCTION public.link_user_and_profile_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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

  -- Accept both 'approved' (canonical post-20260401) and 'accepted' (legacy).
  IF EXISTS (
    SELECT 1
    FROM public.access_requests ar
    WHERE lower(ar.email) = lower(COALESCE(NEW.email,''))
      AND ar.status IN ('approved', 'accepted')
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
        -- OR-merge: once true, stays true; once approval is detected on either
        -- side (handle_new_user or this trigger), the profile flips to true.
        -- This fixes the bug where a prior INSERT with is_approved=false would
        -- lock the profile even after the admin approved the access_request.
        is_approved = COALESCE(public.profiles.is_approved, false)
                      OR COALESCE(EXCLUDED.is_approved, false);

  UPDATE public.students SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);
  UPDATE public.teachers SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND (user_id IS NULL OR user_id = NEW.id);

  RETURN NEW;
END;
$$;
