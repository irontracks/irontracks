-- Migration: Atomic counter increment function
-- Prevents race condition when two concurrent requests read the same count
-- and both write count+1 instead of count+2.

create or replace function increment_counter(
  table_name text,
  column_name text,
  row_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  execute format(
    'UPDATE %I SET %I = coalesce(%I, 0) + 1 WHERE id = $1',
    table_name, column_name, column_name
  ) using row_id;
end;
$$;
