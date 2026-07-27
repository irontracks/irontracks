-- Fase 8: cobrança recorrente aluno→professor (cartão via preapproval MP + PIX automático via cron).
-- Só ADD COLUMN / índices em tabelas que já existem e já são RLS-locked
-- (20260711190243_teacher_billing_forge_lockdown: authenticated não escreve; escrita só service-role).
-- Nenhuma tabela nova → nenhuma policy nova. Produção tinha 0 assinaturas/cobranças de aluno ao aplicar.

-- 1) Recorrência na assinatura do aluno
ALTER TABLE public.student_subscriptions
  ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_method text,          -- 'pix' | 'card'
  ADD COLUMN IF NOT EXISTS preapproval_id text,          -- id do preapproval MP (cartão)
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_attempts integer NOT NULL DEFAULT 0;

-- 2) Marca do ciclo em cada cobrança (no máximo 1 cobrança viva por assinatura+ciclo)
ALTER TABLE public.student_charges
  ADD COLUMN IF NOT EXISTS period text;                  -- 'YYYY-MM' do ciclo recorrente

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_charges_sub_period
  ON public.student_charges (subscription_id, period)
  WHERE period IS NOT NULL AND status <> 'cancelled';

-- 3) Dedup de eventos de webhook por request_id (0 duplicatas conferidas antes de aplicar)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_webhook_request_id
  ON public.mercadopago_webhook_events (request_id)
  WHERE request_id IS NOT NULL;

-- 4) Índice pro cron de PIX vencendo varrer rápido
CREATE INDEX IF NOT EXISTS idx_student_subscriptions_due
  ON public.student_subscriptions (status, next_due_date)
  WHERE recurring = true;
