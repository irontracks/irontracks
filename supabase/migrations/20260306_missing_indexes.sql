-- =====================================================
-- IronTracks — Missing Indexes
-- Created: 2026-03-06
-- Note: CONCURRENTLY removed for supabase db push compatibility
-- =====================================================

-- 1. Enable trigram extension (no-op if already installed)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. workouts(user_id, date DESC)
--    Used by: GET /api/workouts/history
--    Query pattern: WHERE user_id = $1 AND is_template = false ORDER BY date DESC LIMIT N
--    Without this index: Postgres falls back to seq scan on workouts, then sort in memory.
CREATE INDEX IF NOT EXISTS idx_workouts_user_date
  ON public.workouts (user_id, date DESC)
  WHERE is_template = false;

-- 3. exercises.name — GIN trigram index for ILIKE '%q%' searches
--    Used by: GET /api/exercises/search (on cache miss)
--    Without this index: every ILIKE '%term%' is a sequential scan across all exercises.
--    This index makes ILIKE '%term%' use a Bitmap Index Scan instead.
CREATE INDEX IF NOT EXISTS idx_exercises_name_trgm
  ON public.exercises USING gin (name gin_trgm_ops);
