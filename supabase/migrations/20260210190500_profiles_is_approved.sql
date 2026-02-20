BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false;

UPDATE public.profiles
  SET is_approved = true
  WHERE is_approved IS DISTINCT FROM true;

COMMIT;

