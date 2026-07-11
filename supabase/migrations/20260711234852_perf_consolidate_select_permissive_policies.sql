-- PERFORMANCE (auditoria UX/perf): advisor multiple_permissive_policies. Consolida policies
-- PERMISSIVE de SELECT redundantes: N policies -> 1 com USING (q1 OR q2 ...). Postgres já
-- combina permissivas como OR, então é IDENTIDADE (mesmo conjunto de linhas visíveis), só
-- reduz a reavaliação por linha. Escopo: APENAS cmd=SELECT (sem WITH CHECK = zero risco de
-- default de check das policies ALL). Lê o qual gravado verbatim (sem transcrição manual).
-- Tabelas: workouts(4->1), profiles(3->1), active_workout_sessions(2->1), exercises(2->1), sets(2->1).
DO $$
DECLARE g record; p record; v_using text; v_roles text; v_newname text;
BEGIN
  FOR g IN
    SELECT tablename, roles FROM pg_policies
    WHERE schemaname='public' AND permissive='PERMISSIVE' AND cmd='SELECT'
    GROUP BY tablename, roles HAVING count(*) > 1
  LOOP
    v_using := NULL;
    FOR p IN SELECT policyname, qual FROM pg_policies
      WHERE schemaname='public' AND permissive='PERMISSIVE' AND cmd='SELECT'
        AND tablename=g.tablename AND roles=g.roles ORDER BY policyname
    LOOP
      IF p.qual IS NOT NULL THEN
        v_using := CASE WHEN v_using IS NULL THEN '('||p.qual||')' ELSE v_using||' OR ('||p.qual||')' END;
      END IF;
    END LOOP;
    FOR p IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND permissive='PERMISSIVE' AND cmd='SELECT'
        AND tablename=g.tablename AND roles=g.roles
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, g.tablename); END LOOP;
    v_roles := array_to_string(g.roles, ', ');
    v_newname := g.tablename||'__select_merged';
    EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO %s USING (%s)',
                   v_newname, g.tablename, v_roles, v_using);
  END LOOP;
END $$;
