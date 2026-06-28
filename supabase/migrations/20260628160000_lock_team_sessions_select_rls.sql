-- 2ª auditoria de segurança (2026-06-28) — team_sessions world-readable.
--
-- A tabela team_sessions tinha DUAS policies SELECT permissivas `USING(true)` para o
-- role `public` ("Anyone can view team sessions" e "Users view team sessions"). Como a
-- RLS combina policies permissivas via OR, essas duas anulavam a policy correta
-- `team_sessions_select` (is_admin() OR host_uid = auth.uid() OR participante), deixando
-- QUALQUER usuário autenticado ler TODAS as sessões — participants (uid/nome/foto) e
-- workout_state de todo mundo. Info-disclosure de quem treina com quem + estado do treino.
--
-- Correção: dropar as duas policies USING(true). A leitura passa a ser governada só pela
-- team_sessions_select (membership), que já existe e cobre 100% dos reads legítimos do app:
-- host na criação, participante no sync (TeamWorkoutContext/useGhostPartner/useTeamStreak
-- filtram por uid), e rotas de servidor usam service-role (bypass). Join de convidado é via
-- RPC SECURITY DEFINER (bypass) que adiciona o uid a participants antes do próximo read.
--
-- Validado em dry-run transacional contra dados reais (66 sessões):
--   host  -> lê a própria sessão (count=1);
--   não-membro -> antes via 66 (leak), DEPOIS vê 0. Leak fechado, fluxo preservado.
--
-- Rollback (reabre o leak — NÃO recomendado):
--   CREATE POLICY "Users view team sessions" ON public.team_sessions FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Anyone can view team sessions" ON public.team_sessions;
DROP POLICY IF EXISTS "Users view team sessions" ON public.team_sessions;
