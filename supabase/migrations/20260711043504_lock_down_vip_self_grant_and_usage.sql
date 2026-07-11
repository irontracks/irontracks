-- Fecha duas brechas de RLS na área VIP (auditoria 2026-07-11):
--
--   1. app_subscriptions: qualquer usuário autenticado inseria a própria linha
--      (plan_id='vip_elite', status='active') e virava VIP Elite vitalício sem
--      pagar. A policy app_subscriptions_insert_own autorizava o INSERT e não
--      restringia plan_id/status; o role authenticated ainda tinha o GRANT.
--
--   2. vip_usage_daily: o usuário dava UPDATE em usage_count=0 e zerava as
--      próprias cotas de IA (inclusive o teto anti-abuso do Gemini pago),
--      anulando o RPC atômico increment_vip_usage_daily.
--
-- Nenhum fluxo legítimo escreve nessas tabelas pelo client do usuário: checkout,
-- webhook do RevenueCat e revenuecat/sync usam service_role (createAdminClient,
-- ignora RLS/grants), e a contabilidade de cota passa só pelos RPCs
-- SECURITY DEFINER (owner postgres). Mantemos apenas o SELECT próprio, do qual
-- getVipPlanLimits/checkVipFeatureAccess dependem para ler o status.

-- ── app_subscriptions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS app_subscriptions_insert_own ON public.app_subscriptions;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.app_subscriptions FROM anon, authenticated;

-- ── vip_usage_daily ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS vip_usage_daily_insert_own ON public.vip_usage_daily;
DROP POLICY IF EXISTS vip_usage_daily_upsert_own ON public.vip_usage_daily;
DROP POLICY IF EXISTS vip_usage_daily_update_own ON public.vip_usage_daily;
DROP POLICY IF EXISTS vip_usage_daily_upsert_own_update ON public.vip_usage_daily;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.vip_usage_daily FROM anon, authenticated;
