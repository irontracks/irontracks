-- =====================================================
-- Dead Letter Queue for failed webhooks
-- =====================================================

CREATE TABLE IF NOT EXISTS webhook_dead_letters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL,          -- 'mercadopago' | 'asaas'
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  attempts int DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Index for querying unresolved dead letters
CREATE INDEX IF NOT EXISTS idx_dead_letters_unresolved
ON webhook_dead_letters (source, created_at DESC)
WHERE resolved_at IS NULL;

-- RLS: only service_role can access
ALTER TABLE webhook_dead_letters ENABLE ROW LEVEL SECURITY;
-- No policies = nobody except service_role can access
