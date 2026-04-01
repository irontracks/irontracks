-- Migration: add_email_indexes
-- Adds indexes on email columns used in ILIKE / eq lookups.
-- profiles.email: used in access-request/create route (.ilike('email', ...))
-- access_requests.email: used in access-request/create route (.eq('email', ...))
-- Both are sequential scans without an index → slow as user base grows.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_access_requests_email
  ON public.access_requests (email);
