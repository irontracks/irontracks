-- Dedupe direct chat channels and enforce canonical uniqueness

CREATE OR REPLACE FUNCTION public.dedupe_direct_channels()
RETURNS TABLE (pairs_affected BIGINT, channels_deduped BIGINT, messages_moved BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  moved BIGINT := 0;
  dedup BIGINT := 0;
  affected BIGINT := 0;
  rec RECORD;
  dup UUID;
  canon UUID;
  cnt BIGINT;
  jwt_role text := auth.role();
BEGIN
  IF COALESCE(jwt_role, '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR rec IN (
    SELECT LEAST(user1_id, user2_id) AS u1,
           GREATEST(user1_id, user2_id) AS u2,
           ARRAY_AGG(id ORDER BY created_at ASC) AS ids
    FROM public.direct_channels
    GROUP BY LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id)
    HAVING COUNT(*) > 1
  ) LOOP
    affected := affected + 1;
    canon := rec.ids[1];
    FOR i IN 2 .. ARRAY_LENGTH(rec.ids, 1) LOOP
      dup := rec.ids[i];
      -- move messages
      UPDATE public.direct_messages SET channel_id = canon WHERE channel_id = dup;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      moved := moved + cnt;
      -- delete duplicate channel
      DELETE FROM public.direct_channels WHERE id = dup;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      dedup := dedup + cnt;
    END LOOP;
  END LOOP;

  -- Create canonical unique index to prevent future duplicates
  PERFORM 1 FROM pg_indexes WHERE indexname = 'uniq_direct_pair_idx';
  IF NOT FOUND THEN
    EXECUTE 'CREATE UNIQUE INDEX uniq_direct_pair_idx ON public.direct_channels (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))';
  END IF;

  RETURN QUERY SELECT affected, dedup, moved;
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_direct_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dedupe_direct_channels() TO service_role;
