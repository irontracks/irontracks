alter table public.workouts
  add column if not exists finish_idempotency_key text;

create unique index if not exists workouts_user_finish_idempotency_key_uniq
  on public.workouts (user_id, finish_idempotency_key)
  where (
    is_template = false
    and finish_idempotency_key is not null
    and finish_idempotency_key <> ''
  );
