-- Migration: Teachers/trainers podem ler workouts e sets dos seus alunos
--
-- PROBLEMA: workouts e sets só tinham RLS para o próprio dono (user_id = auth_uid()).
-- Teachers não conseguiam ver nada dos alunos — as queries retornavam vazio
-- sem erro (RLS bloqueia silenciosamente).
--
-- SOLUÇÃO: Adicionar políticas SELECT que verificam se o workout/set pertence
-- a um aluno vinculado ao teacher na tabela students.

-- workouts: teacher lê workouts dos seus alunos
DROP POLICY IF EXISTS "Teachers can read student workouts" ON public.workouts;
CREATE POLICY "Teachers can read student workouts"
ON public.workouts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE (
      s.user_id = workouts.user_id              -- aluno é dono do workout (via auth uid)
      OR s.id::text = workouts.student_id::text  -- workout referencia o row do aluno
    )
    AND s.teacher_id = (SELECT auth.uid())
  )
);

-- sets: já coberto por sets_select_silo que usa JOIN exercises→workouts→is_teacher_of
-- Não é necessária policy adicional aqui.
