-- Expand RLS to allow authenticated inserts where trainer_id = auth.uid()
-- without requiring role check. Keeps existing policies intact.

CREATE POLICY "Authenticated insert as trainer" ON public.assessments
  FOR INSERT
  WITH CHECK (trainer_id = auth.uid());

-- Also allow authenticated users who are trainers/admins to update/delete by trainer_id
CREATE POLICY "Authenticated manage own trainer assessments" ON public.assessments
  FOR UPDATE
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

CREATE POLICY "Authenticated delete own trainer assessments" ON public.assessments
  FOR DELETE
  USING (trainer_id = auth.uid());
