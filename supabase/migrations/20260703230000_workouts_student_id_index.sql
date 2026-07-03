-- Migration: índice em workouts.student_id
--
-- O advisor de performance já apontava a FK workouts_student_id_fkey sem
-- índice cobrindo. As policies de 20260703220000 ("Students can read
-- assigned workouts" em workouts/exercises/sets) fazem join por
-- workouts.student_id, tornando o índice necessário pra RLS não degradar
-- SELECTs de exercises/sets (avaliadas por linha).
--
-- Parcial (student_id IS NOT NULL): hoje quase todo workout tem student_id
-- NULL — o índice fica mínimo e cobre exatamente o caminho das policies.

CREATE INDEX IF NOT EXISTS idx_workouts_student_id
ON public.workouts (student_id)
WHERE student_id IS NOT NULL;
