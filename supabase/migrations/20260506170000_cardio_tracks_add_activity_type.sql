-- Add activity_type to cardio_tracks
-- Default 'running' is backfilled to all existing rows by Postgres DDL

ALTER TABLE public.cardio_tracks
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'running';
