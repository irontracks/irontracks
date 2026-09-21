-- Terceiro acidente na mesma função de trial (21/09/2026): o CHECK de
-- user_entitlements.provider NUNCA aceitou 'trial', apesar do comentário em
-- src/utils/vip/trial.ts dizer que isso tinha sido corrigido em 16/08/2026.
-- Medido: toda tentativa de inserir provider='trial' falhava com 23514, e o
-- código (que nunca lança) engolia o erro e devolvia false em silêncio.
ALTER TABLE public.user_entitlements DROP CONSTRAINT user_entitlements_provider_check;
ALTER TABLE public.user_entitlements ADD CONSTRAINT user_entitlements_provider_check
  CHECK (provider = ANY (ARRAY['asaas'::text, 'stripe'::text, 'apple'::text, 'google'::text, 'manual'::text, 'admin'::text, 'mercadopago'::text, 'trial'::text]));
