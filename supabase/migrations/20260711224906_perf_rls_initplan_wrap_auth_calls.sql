-- PERFORMANCE (auditoria UX/perf 2026-07-11): advisor auth_rls_initplan (204 policies).
-- Envolve chamadas auth.uid()/auth.role()/auth.jwt()/is_admin()/current_user_is_admin() em
-- (select ...) → o planner avalia 1×/query (InitPlan) em vez de POR LINHA. NÃO muda a
-- semântica (mesmo valor, menos avaliações). Ganho grande nas tabelas quentes (students
-- chegou a ler 1,37 bi de tuplas por reavaliação por linha).
--
-- Usa regexp_replace com fronteira ((^|[^ident.])func\(\)) pra NÃO casar função dentro de
-- outra (ex.: is_admin dentro de current_user_is_admin). Protege já-embrulhados com sentinela
-- (evita double-wrap). NÃO toca em funções com argumento (is_teacher_of(x)). Transacional:
-- se uma policy falhar, reverte tudo. ALTER só do USING/WITH CHECK conforme o cmd.
DO $$
DECLARE r record; v_qual text; v_check text; v_sql text;
  FUNCTION_PATTERN constant text := '(^|[^a-zA-Z0-9_.])(auth\.uid|auth\.role|auth\.jwt|current_user_is_admin|is_admin)\(\)';
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND ( (qual IS NOT NULL AND qual ~ 'auth\.(uid|role|jwt)\(\)|is_admin\(\)')
         OR (with_check IS NOT NULL AND with_check ~ 'auth\.(uid|role|jwt)\(\)|is_admin\(\)') )
  LOOP
    v_qual := r.qual;
    IF v_qual IS NOT NULL THEN
      v_qual := replace(v_qual,'( SELECT auth.uid() AS uid)','§U§');
      v_qual := replace(v_qual,'( SELECT auth.role() AS role)','§R§');
      v_qual := replace(v_qual,'( SELECT auth.jwt() AS jwt)','§J§');
      v_qual := replace(v_qual,'( SELECT current_user_is_admin() AS current_user_is_admin)','§C§');
      v_qual := replace(v_qual,'( SELECT is_admin() AS is_admin)','§A§');
      v_qual := regexp_replace(v_qual, FUNCTION_PATTERN, '\1(select \2())', 'g');
      v_qual := replace(v_qual,'§U§','( SELECT auth.uid() AS uid)');
      v_qual := replace(v_qual,'§R§','( SELECT auth.role() AS role)');
      v_qual := replace(v_qual,'§J§','( SELECT auth.jwt() AS jwt)');
      v_qual := replace(v_qual,'§C§','( SELECT current_user_is_admin() AS current_user_is_admin)');
      v_qual := replace(v_qual,'§A§','( SELECT is_admin() AS is_admin)');
    END IF;
    v_check := r.with_check;
    IF v_check IS NOT NULL THEN
      v_check := replace(v_check,'( SELECT auth.uid() AS uid)','§U§');
      v_check := replace(v_check,'( SELECT auth.role() AS role)','§R§');
      v_check := replace(v_check,'( SELECT auth.jwt() AS jwt)','§J§');
      v_check := replace(v_check,'( SELECT current_user_is_admin() AS current_user_is_admin)','§C§');
      v_check := replace(v_check,'( SELECT is_admin() AS is_admin)','§A§');
      v_check := regexp_replace(v_check, FUNCTION_PATTERN, '\1(select \2())', 'g');
      v_check := replace(v_check,'§U§','( SELECT auth.uid() AS uid)');
      v_check := replace(v_check,'§R§','( SELECT auth.role() AS role)');
      v_check := replace(v_check,'§J§','( SELECT auth.jwt() AS jwt)');
      v_check := replace(v_check,'§C§','( SELECT current_user_is_admin() AS current_user_is_admin)');
      v_check := replace(v_check,'§A§','( SELECT is_admin() AS is_admin)');
    END IF;
    v_sql := 'ALTER POLICY ' || quote_ident(r.policyname) || ' ON public.' || quote_ident(r.tablename);
    IF r.qual IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_qual || ')'; END IF;
    IF r.with_check IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_check || ')'; END IF;
    EXECUTE v_sql;
  END LOOP;
END $$;
