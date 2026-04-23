-- Fix MercadoPago webhook upsert silently failing on partial unique indexes.
--
-- Context
-- -------
-- The MercadoPago webhook handler (src/app/api/billing/webhooks/mercadopago/route.ts)
-- uses two Supabase upserts:
--
--   .upsert({...}, { onConflict: 'provider,provider_payment_id' })         -- app_payments
--   .upsert({...}, { onConflict: 'provider,provider_subscription_id' })    -- user_entitlements
--
-- Both tables had the matching unique index declared as a *partial* unique
-- index with a `WHERE <col> IS NOT NULL` clause:
--
--   app_payments_provider_payment_id_ux
--     UNIQUE (provider, provider_payment_id)
--     WHERE (provider IS NOT NULL AND provider_payment_id IS NOT NULL)
--
--   user_entitlements_provider_subscription_id_ux
--     UNIQUE (provider, provider_subscription_id)
--     WHERE (provider_subscription_id IS NOT NULL)
--
-- PostgreSQL refuses `ON CONFLICT (cols)` on a partial index unless the
-- full predicate is repeated on the ON CONFLICT clause. The Supabase JS v2
-- client has no way to send that predicate, so every upsert failed with:
--
--   ERROR 42P10: there is no unique or exclusion constraint matching the
--                ON CONFLICT specification
--
-- Because the handler did not read the `{ error }` field from the Supabase
-- response, the error was swallowed. Combined with the MP webhook returning
-- 200 OK back to MercadoPago, the failure was invisible in logs/retries.
--
-- Impact in production
-- --------------------
-- * Every MP `payment.created` / `payment.updated` webhook was logged into
--   `mercadopago_webhook_events` (that insert has its own local try/catch)
--   but neither `app_payments` nor `user_entitlements` was ever written.
-- * If a real user had paid a PIX or card, their VIP would NEVER be granted
--   in `user_entitlements` — the primary VIP resolution table — so the app
--   would correctly treat them as free tier even though they paid.
-- * The historical 3 pending PIX in production (data_id 148282568249,
--   146260559711, 146588300884) exhibit exactly this pattern: webhook
--   present, app_payments.raw = null.
--
-- Fix
-- ---
-- Add plain (non-partial) UNIQUE constraints covering the same columns.
-- PostgreSQL will use whichever unique constraint/index satisfies the
-- ON CONFLICT clause, so the partial indexes can stay around. NULLs remain
-- distinct by default (SQL semantics), matching the old partial behaviour
-- for the admin-grant case in `user_entitlements` (provider_subscription_id
-- is NULL for grants).
--
-- Verified after applying:
--   INSERT ... ON CONFLICT (provider, provider_payment_id) DO UPDATE ...      ✓
--   INSERT ... ON CONFLICT (provider, provider_subscription_id) DO UPDATE ... ✓
-- and with a real R$0,50 PIX created against production: app_payments was
-- populated within 1 s of the webhook arriving (previously empty forever).

ALTER TABLE public.app_payments
  ADD CONSTRAINT app_payments_provider_pid_uk
  UNIQUE (provider, provider_payment_id);

ALTER TABLE public.user_entitlements
  ADD CONSTRAINT user_entitlements_provider_psid_uk
  UNIQUE (provider, provider_subscription_id);
