-- Add idempotency key to prevent duplicated workout finishes (e.g. double-tap / retries)

alter table public.workouts
  add column if not exists idempotency_key text;

-- Unique per user, but only when a non-empty idempotency_key is provided
create unique index if not exists workouts_user_id_idempotency_key_uniq
  on public.workouts (user_id, idempotency_key)
  where (idempotency_key is not null and idempotency_key <> '');

