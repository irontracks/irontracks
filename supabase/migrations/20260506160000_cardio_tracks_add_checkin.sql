-- Migration: cardio_tracks_add_checkin
-- Adds optional post-cardio check-in fields so users can record
-- how the session felt and leave a quick note.

ALTER TABLE public.cardio_tracks
  ADD COLUMN IF NOT EXISTS notes            text,
  ADD COLUMN IF NOT EXISTS perceived_effort smallint
    CHECK (perceived_effort BETWEEN 1 AND 5);
