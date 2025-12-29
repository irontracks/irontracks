-- Expand assessments RLS to work without relying on profiles.role.

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own assessments" ON public.assessments;
DROP POLICY IF EXISTS "Trainers manage student assessments" ON public.assessments;

DROP POLICY IF EXISTS "Authenticated select assessments" ON public.assessments;
DROP POLICY IF EXISTS "Authenticated insert as trainer" ON public.assessments;
DROP POLICY IF EXISTS "Authenticated manage own trainer assessments" ON public.assessments;
DROP POLICY IF EXISTS "Authenticated delete own trainer assessments" ON public.assessments;

CREATE POLICY "Authenticated select assessments" ON public.assessments
  FOR SELECT
  TO authenticated
  USING (trainer_id = auth.uid() OR student_id = auth.uid());

CREATE POLICY "Authenticated insert as trainer" ON public.assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (trainer_id = auth.uid());

CREATE POLICY "Authenticated manage own trainer assessments" ON public.assessments
  FOR UPDATE
  TO authenticated
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

CREATE POLICY "Authenticated delete own trainer assessments" ON public.assessments
  FOR DELETE
  TO authenticated
  USING (trainer_id = auth.uid());
