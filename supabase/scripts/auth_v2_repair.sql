-- Repair / backfill for auth v2
-- 1) Create profiles for auth users missing one
INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
  COALESCE(u.raw_user_meta_data->>'picture', u.raw_user_meta_data->>'avatar_url'),
  now(),
  CASE
    WHEN EXISTS (SELECT 1 FROM public.admin_emails a WHERE a.email = lower(u.email)) THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.teachers t WHERE lower(t.email) = lower(u.email)) THEN 'teacher'
    ELSE 'student'
  END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 2) Link teachers/students user_id by email
UPDATE public.teachers t
SET user_id = u.id
FROM auth.users u
WHERE lower(t.email) = lower(u.email)
  AND (t.user_id IS NULL OR t.user_id = u.id);

UPDATE public.students s
SET user_id = u.id
FROM auth.users u
WHERE lower(s.email) = lower(u.email)
  AND (s.user_id IS NULL OR s.user_id = u.id);
