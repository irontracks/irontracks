BEGIN;

ALTER TABLE public.access_requests
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.access_requests
  ALTER COLUMN birth_date DROP NOT NULL;

COMMIT;

