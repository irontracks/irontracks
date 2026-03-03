-- =====================================================
-- RLS Audit: Find tables WITHOUT Row Level Security
-- Run periodically to ensure no new tables slip through
-- =====================================================

SELECT
  schemaname,
  tablename,
  CASE WHEN rowsecurity THEN '✅ RLS ON' ELSE '❌ RLS OFF' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;
