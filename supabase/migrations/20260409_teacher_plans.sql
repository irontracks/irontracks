-- Migration: teacher_plans
-- Creates plan tiers for teachers (Free / Starter / Pro / Elite / Unlimited)
-- and adds plan tracking columns to the teachers table.

-- ─── 1. teacher_plans lookup table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_plans (
  id            text        PRIMARY KEY,
  name          text        NOT NULL,
  description   text,
  max_students  integer     NOT NULL DEFAULT 2,   -- 0 = unlimited
  price_cents   integer     NOT NULL DEFAULT 0,
  currency      text        NOT NULL DEFAULT 'BRL',
  sort_order    integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed plans (idempotent)
INSERT INTO public.teacher_plans (id, name, description, max_students, price_cents, currency, sort_order)
VALUES
  ('free',      'Free',      'Ideal para experimentar a plataforma',           2,     0,     'BRL', 0),
  ('starter',   'Starter',   'Para personal trainers iniciantes',              15,  4900,   'BRL', 1),
  ('pro',       'Pro',       'Para personal trainers estabelecidos',           40,  9700,   'BRL', 2),
  ('elite',     'Elite',     'Para personal trainers de alto volume',         100, 17900,   'BRL', 3),
  ('unlimited', 'Unlimited', 'Para academias e franquias — alunos ilimitados',  0, 24900,   'BRL', 4)
ON CONFLICT (id) DO UPDATE
  SET name         = EXCLUDED.name,
      description  = EXCLUDED.description,
      max_students = EXCLUDED.max_students,
      price_cents  = EXCLUDED.price_cents,
      sort_order   = EXCLUDED.sort_order;

-- ─── 2. Add plan columns to teachers ─────────────────────────────────────────
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS plan_id              text        NOT NULL DEFAULT 'free'
    REFERENCES public.teacher_plans(id),
  ADD COLUMN IF NOT EXISTS plan_status          text        NOT NULL DEFAULT 'active'
    CHECK (plan_status IN ('active', 'trialing', 'past_due', 'cancelled')),
  ADD COLUMN IF NOT EXISTS plan_valid_until     timestamptz,
  ADD COLUMN IF NOT EXISTS plan_subscription_id text;       -- MercadoPago payment/subscription id

-- ─── 3. teacher_student_count(teacher_user_id) → integer ─────────────────────
CREATE OR REPLACE FUNCTION public.teacher_student_count(p_teacher_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::integer
  FROM public.students
  WHERE teacher_id = p_teacher_user_id
$$;

-- ─── 4. teacher_can_add_student(teacher_user_id) → boolean ───────────────────
CREATE OR REPLACE FUNCTION public.teacher_can_add_student(p_teacher_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan_id      text;
  v_plan_status  text;
  v_max_students integer;
  v_count        integer;
BEGIN
  SELECT t.plan_id, t.plan_status
    INTO v_plan_id, v_plan_status
    FROM public.teachers t
   WHERE t.user_id = p_teacher_user_id
   LIMIT 1;

  -- Teacher row not found → treat as free plan
  IF v_plan_id IS NULL THEN v_plan_id := 'free'; END IF;
  -- Cancelled plan → fall back to free limits
  IF v_plan_status = 'cancelled' THEN v_plan_id := 'free'; END IF;

  SELECT tp.max_students INTO v_max_students
    FROM public.teacher_plans tp
   WHERE tp.id = v_plan_id;

  IF v_max_students IS NULL THEN v_max_students := 2; END IF;
  IF v_max_students = 0 THEN RETURN true; END IF; -- unlimited

  SELECT COUNT(*)::integer INTO v_count
    FROM public.students
   WHERE teacher_id = p_teacher_user_id;

  RETURN v_count < v_max_students;
END;
$$;

-- ─── 5. RLS: teacher_plans is read-only for all authenticated users ───────────
ALTER TABLE public.teacher_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'teacher_plans'
      AND policyname = 'Anyone can read active teacher plans'
  ) THEN
    CREATE POLICY "Anyone can read active teacher plans"
      ON public.teacher_plans
      FOR SELECT
      TO authenticated, anon
      USING (is_active = true);
  END IF;
END $$;
