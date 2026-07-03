-- Migration: Aluno pode LER treinos atribuídos ao seu registro em students
--
-- PROBLEMA (PR #249, revisão adversarial): o RPC get_dashboard_bootstrap
-- (SECURITY DEFINER, branch 3) e o fallback do /api/dashboard/bootstrap
-- entregam ao aluno treinos onde workouts.student_id = students.id
-- (students.user_id = auth.uid()), mas nenhuma policy de SELECT em workouts
-- cobre esse caminho — o refetch client-side (sob RLS) não vê essas linhas,
-- causando treino que aparece no primeiro paint e some no refetch.
--
-- CONTEXTO: assignWorkoutToStudent cria treino com student_id (e user_id NULL)
-- quando o aluno ainda não tem conta auth. Se o aluno criar conta depois e o
-- registro em students for vinculado (students.user_id preenchido), esses
-- treinos ficam invisíveis pra ele sob RLS. Este é o caminho que o produto
-- já entrega via RPC/API — a RLS passa a espelhar.
--
-- ESCOPO: SELECT apenas. Aluno NÃO ganha INSERT/UPDATE/DELETE nesses treinos.

-- workouts: aluno lê treinos atribuídos ao seu registro em students
DROP POLICY IF EXISTS "Students can read assigned workouts" ON public.workouts;
CREATE POLICY "Students can read assigned workouts"
ON public.workouts FOR SELECT TO authenticated
USING (
  student_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = workouts.student_id
      AND s.user_id = (SELECT auth.uid())
  )
);

-- exercises: idem, via join com workouts
DROP POLICY IF EXISTS "Students can read assigned workout exercises" ON public.exercises;
CREATE POLICY "Students can read assigned workout exercises"
ON public.exercises FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workouts w
    JOIN public.students s ON s.id = w.student_id
    WHERE w.id = exercises.workout_id
      AND s.user_id = (SELECT auth.uid())
  )
);

-- sets: idem, via join exercises → workouts
DROP POLICY IF EXISTS "Students can read assigned workout sets" ON public.sets;
CREATE POLICY "Students can read assigned workout sets"
ON public.sets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exercises e
    JOIN public.workouts w ON w.id = e.workout_id
    JOIN public.students s ON s.id = w.student_id
    WHERE e.id = sets.exercise_id
      AND s.user_id = (SELECT auth.uid())
  )
);
