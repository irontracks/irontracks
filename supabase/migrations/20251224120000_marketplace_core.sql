DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'asaas_account_id'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN asaas_account_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'asaas_wallet_id'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN asaas_wallet_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'asaas_account_status'
  ) THEN
    ALTER TABLE public.teachers ADD COLUMN asaas_account_status text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS teachers_user_id_unique ON public.teachers(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_asaas_account_id_unique ON public.teachers(asaas_account_id) WHERE asaas_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS teachers_asaas_wallet_id_unique ON public.teachers(asaas_wallet_id) WHERE asaas_wallet_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.teacher_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency text NOT NULL DEFAULT 'BRL',
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_plans_teacher_user_id_idx ON public.teacher_plans(teacher_user_id);
CREATE INDEX IF NOT EXISTS teacher_plans_status_idx ON public.teacher_plans(status);

CREATE TABLE IF NOT EXISTS public.asaas_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  asaas_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.teacher_plans(id) ON DELETE RESTRICT,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'past_due', 'inactive')),
  asaas_subscription_id text UNIQUE,
  asaas_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_subscriptions_plan_student_unique ON public.marketplace_subscriptions(plan_id, student_user_id);
CREATE INDEX IF NOT EXISTS marketplace_subscriptions_student_user_id_idx ON public.marketplace_subscriptions(student_user_id);
CREATE INDEX IF NOT EXISTS marketplace_subscriptions_teacher_user_id_idx ON public.marketplace_subscriptions(teacher_user_id);

CREATE TABLE IF NOT EXISTS public.marketplace_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.marketplace_subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.teacher_plans(id) ON DELETE SET NULL,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  platform_fee_cents integer NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  billing_type text,
  status text NOT NULL DEFAULT 'pending',
  due_date date,
  paid_at timestamptz,
  asaas_payment_id text UNIQUE,
  invoice_url text,
  pix_qr_code text,
  pix_payload text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_payments_student_user_id_idx ON public.marketplace_payments(student_user_id);
CREATE INDEX IF NOT EXISTS marketplace_payments_teacher_user_id_idx ON public.marketplace_payments(teacher_user_id);
CREATE INDEX IF NOT EXISTS marketplace_payments_subscription_id_idx ON public.marketplace_payments(subscription_id);

CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_event_id text,
  event_type text,
  payment_id text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE UNIQUE INDEX IF NOT EXISTS asaas_webhook_events_event_id_unique ON public.asaas_webhook_events(asaas_event_id) WHERE asaas_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS asaas_webhook_events_payment_id_idx ON public.asaas_webhook_events(payment_id) WHERE payment_id IS NOT NULL;

ALTER TABLE public.teacher_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_plans' AND policyname = 'teacher_plans_select') THEN
    DROP POLICY teacher_plans_select ON public.teacher_plans;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_plans' AND policyname = 'teacher_plans_insert') THEN
    DROP POLICY teacher_plans_insert ON public.teacher_plans;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_plans' AND policyname = 'teacher_plans_update') THEN
    DROP POLICY teacher_plans_update ON public.teacher_plans;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'teacher_plans' AND policyname = 'teacher_plans_delete') THEN
    DROP POLICY teacher_plans_delete ON public.teacher_plans;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marketplace_subscriptions' AND policyname = 'marketplace_subscriptions_select') THEN
    DROP POLICY marketplace_subscriptions_select ON public.marketplace_subscriptions;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marketplace_payments' AND policyname = 'marketplace_payments_select') THEN
    DROP POLICY marketplace_payments_select ON public.marketplace_payments;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'asaas_customers' AND policyname = 'asaas_customers_select') THEN
    DROP POLICY asaas_customers_select ON public.asaas_customers;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'asaas_webhook_events' AND policyname = 'asaas_webhook_events_select') THEN
    DROP POLICY asaas_webhook_events_select ON public.asaas_webhook_events;
  END IF;
END $$;

CREATE POLICY teacher_plans_select
ON public.teacher_plans
FOR SELECT
TO authenticated
USING (public.is_admin() OR teacher_user_id = auth.uid() OR status = 'active');

CREATE POLICY teacher_plans_insert
ON public.teacher_plans
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() OR teacher_user_id = auth.uid());

CREATE POLICY teacher_plans_update
ON public.teacher_plans
FOR UPDATE
TO authenticated
USING (public.is_admin() OR teacher_user_id = auth.uid())
WITH CHECK (public.is_admin() OR teacher_user_id = auth.uid());

CREATE POLICY teacher_plans_delete
ON public.teacher_plans
FOR DELETE
TO authenticated
USING (public.is_admin() OR teacher_user_id = auth.uid());

CREATE POLICY marketplace_subscriptions_select
ON public.marketplace_subscriptions
FOR SELECT
TO authenticated
USING (public.is_admin() OR student_user_id = auth.uid() OR teacher_user_id = auth.uid());

CREATE POLICY marketplace_payments_select
ON public.marketplace_payments
FOR SELECT
TO authenticated
USING (public.is_admin() OR student_user_id = auth.uid() OR teacher_user_id = auth.uid());

CREATE POLICY asaas_customers_select
ON public.asaas_customers
FOR SELECT
TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

CREATE POLICY asaas_webhook_events_select
ON public.asaas_webhook_events
FOR SELECT
TO authenticated
USING (public.is_admin());
