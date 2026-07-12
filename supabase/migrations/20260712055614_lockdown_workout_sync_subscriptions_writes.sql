-- Auditoria do controle professor->aluno (Achado 1, defense-in-depth). As policies de
-- INSERT/UPDATE/DELETE do usuário em workout_sync_subscriptions só validavam
-- source_user_id = auth.uid() -- NÃO a relação professor<->aluno. Um usuário podia forjar
-- {source_user_id: self, target_user_id: vítima, teacher_id/student_id: arbitrário}. Inócuo
-- hoje (o único consumidor perigoso, syncTemplateToSubscribers, era dead code sem caller e
-- foi removido no mesmo PR), mas era bomba-relógio: se religado, escreveria os templates do
-- atacante na lista da vítima.
-- O único writer legítimo (api/admin/workouts/sync-templates) usa createAdminClient
-- (service-role, bypassa RLS). NENHUM cliente autenticado escreve nesta tabela. Logo,
-- trancar os writes em service-role é seguro e mata o forge. Mantém SELECT (usuário vê as
-- próprias subscriptions) + a policy service_role ALL. Mesmo padrão do lockdown de VIP self-grant.
drop policy if exists workout_sync_subscriptions_insert on public.workout_sync_subscriptions;
drop policy if exists workout_sync_subscriptions_update on public.workout_sync_subscriptions;
drop policy if exists workout_sync_subscriptions_delete on public.workout_sync_subscriptions;
