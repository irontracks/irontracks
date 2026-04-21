ALTER TABLE sets
  ADD COLUMN duration_seconds INTEGER NULL
  CHECK (duration_seconds IS NULL OR duration_seconds > 0);
COMMENT ON COLUMN sets.duration_seconds
  IS 'Duração em segundos para exercícios isométricos (ex: Prancha). NULL para exercícios baseados em reps.';
