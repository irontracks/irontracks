-- Repair / backfill for auth v2
-- 1) Create profiles for auth users missing one
INSERT INTO public.profiles (id, email, display_name, photo_url, last_seen, role)
SELECT
  u.id,
  lower(u.email),
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', lower(u.email)),
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
WITH teacher_candidates AS (
  SELECT
    t.id AS teacher_id,
    u.id AS user_id,
    row_number() OVER (
      PARTITION BY lower(t.email)
      ORDER BY t.created_at DESC NULLS LAST, t.id DESC
    ) AS rn
  FROM public.teachers t
  JOIN auth.users u ON lower(t.email) = lower(u.email)
  WHERE t.user_id IS NULL
),
teacher_selected AS (
  SELECT teacher_id, user_id
  FROM teacher_candidates
  WHERE rn = 1
    AND NOT EXISTS (SELECT 1 FROM public.teachers t2 WHERE t2.user_id = teacher_candidates.user_id)
)
UPDATE public.teachers t
SET user_id = s.user_id
FROM teacher_selected s
WHERE t.id = s.teacher_id;

WITH student_candidates AS (
  SELECT
    s.id AS student_id,
    u.id AS user_id,
    row_number() OVER (
      PARTITION BY lower(s.email)
      ORDER BY s.created_at DESC NULLS LAST, s.id DESC
    ) AS rn
  FROM public.students s
  JOIN auth.users u ON lower(s.email) = lower(u.email)
  WHERE s.user_id IS NULL
),
student_selected AS (
  SELECT student_id, user_id
  FROM student_candidates
  WHERE rn = 1
    AND NOT EXISTS (SELECT 1 FROM public.students s2 WHERE s2.user_id = student_candidates.user_id)
)
UPDATE public.students s
SET user_id = x.user_id
FROM student_selected x
WHERE s.id = x.student_id;
