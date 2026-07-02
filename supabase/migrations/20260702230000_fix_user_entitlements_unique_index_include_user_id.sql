-- BUG CRÍTICO de pagamento: o índice/constraint único de user_entitlements era
-- (provider, provider_subscription_id) SEM user_id. O Apple/RevenueCat grava o
-- productId (SKU) como provider_subscription_id — valor IDÊNTICO pra todos que
-- compram o mesmo plano. Então o 2º comprador do mesmo plano colidia (23505,
-- engolido em silêncio) e ficava SEM linha na tabela primária de VIP.
--
-- Recria incluindo user_id: diferentes usuários com o mesmo SKU não colidem mais;
-- a idempotência por (user_id, provider, provider_subscription_id) segue válida
-- (re-entrega do MESMO webhook pro MESMO usuário). Mais permissivo → não bloqueia
-- linha existente (sem duplicata com provider_subscription_id não-nulo; NULLs
-- distintos por padrão). O onConflict do MercadoPago é atualizado no código junto.
ALTER TABLE public.user_entitlements DROP CONSTRAINT IF EXISTS user_entitlements_provider_psid_uk;
DROP INDEX IF EXISTS public.user_entitlements_provider_subscription_id_ux;

CREATE UNIQUE INDEX IF NOT EXISTS user_entitlements_user_provider_psid_uk
  ON public.user_entitlements (user_id, provider, provider_subscription_id);
