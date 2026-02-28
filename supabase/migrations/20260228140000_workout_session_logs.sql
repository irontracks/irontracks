-- Workout session logs: tabelas normalizadas para analytics
-- Não altera o fluxo existente (active_workout_sessions + JSONB state).
-- Serve como write-ahead log para dados estruturados pós-sessão.

-- Sessão finalizada (1 linha por treino completo)
CREATE TABLE IF NOT EXISTS public.workout_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
  workout_title TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,
  total_volume NUMERIC(12, 2) DEFAULT 0,
  total_sets INTEGER DEFAULT 0,
  total_reps INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sets realizados (1 linha por set executado)
CREATE TABLE IF NOT EXISTS public.workout_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_session_logs(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE SET NULL,
  muscle_group TEXT,
  set_number INTEGER NOT NULL DEFAULT 1,
  weight NUMERIC(8, 2),
  reps INTEGER,
  rpe NUMERIC(3, 1),
  is_warmup BOOLEAN DEFAULT false,
  method TEXT,
  volume NUMERIC(12, 2) GENERATED ALWAYS AS (COALESCE(weight, 0) * COALESCE(reps, 0)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes para queries de analytics
CREATE INDEX IF NOT EXISTS idx_wsl_user_finished ON public.workout_session_logs (user_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_wsl_idempotency ON public.workout_session_logs (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wsetl_session ON public.workout_set_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_wsetl_exercise ON public.workout_set_logs (exercise_name, created_at DESC);

-- RLS
ALTER TABLE public.workout_session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_set_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own session logs
CREATE POLICY "wsl_read_own" ON public.workout_session_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own session logs
CREATE POLICY "wsl_insert_own" ON public.workout_session_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Set logs: read via session ownership
CREATE POLICY "wsetl_read_own" ON public.workout_set_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_session_logs s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- Set logs: insert via session ownership
CREATE POLICY "wsetl_insert_own" ON public.workout_set_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_session_logs s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- Service role full access
GRANT ALL ON public.workout_session_logs TO service_role;
GRANT ALL ON public.workout_set_logs TO service_role;
GRANT SELECT, INSERT ON public.workout_session_logs TO authenticated;
GRANT SELECT, INSERT ON public.workout_set_logs TO authenticated;
