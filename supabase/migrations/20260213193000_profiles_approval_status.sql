BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approval_status text;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approved_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_approval_status_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_approval_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended'));
  END IF;
END $$;

UPDATE public.profiles
SET approval_status = CASE
  WHEN coalesce(role, '') IN ('admin', 'teacher') THEN 'approved'
  WHEN is_approved IS TRUE THEN 'approved'
  ELSE 'pending'
END
WHERE approval_status IS NULL;

UPDATE public.profiles
SET approved_at = COALESCE(approved_at, NOW())
WHERE approval_status = 'approved'
  AND approved_at IS NULL;

COMMIT;
