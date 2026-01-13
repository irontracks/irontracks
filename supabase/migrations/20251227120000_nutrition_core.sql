CREATE TABLE IF NOT EXISTS public.daily_nutrition_logs (
  user_id uuid NOT NULL,
  date date NOT NULL,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_nutrition_logs_pkey PRIMARY KEY (user_id, date),
  CONSTRAINT daily_nutrition_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.daily_nutrition_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Daily nutrition logs select" ON public.daily_nutrition_logs;
DROP POLICY IF EXISTS "Daily nutrition logs insert" ON public.daily_nutrition_logs;
DROP POLICY IF EXISTS "Daily nutrition logs update" ON public.daily_nutrition_logs;
DROP POLICY IF EXISTS "Daily nutrition logs delete" ON public.daily_nutrition_logs;

CREATE POLICY "Daily nutrition logs select" ON public.daily_nutrition_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Daily nutrition logs insert" ON public.daily_nutrition_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Daily nutrition logs update" ON public.daily_nutrition_logs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Daily nutrition logs delete" ON public.daily_nutrition_logs FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.nutrition_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calories numeric NOT NULL DEFAULT 2000,
  protein numeric NOT NULL DEFAULT 150,
  carbs numeric NOT NULL DEFAULT 200,
  fat numeric NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS nutrition_goals_user_id_updated_at_idx ON public.nutrition_goals (user_id, updated_at DESC);

ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nutrition goals select" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Nutrition goals insert" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Nutrition goals update" ON public.nutrition_goals;
DROP POLICY IF EXISTS "Nutrition goals delete" ON public.nutrition_goals;

CREATE POLICY "Nutrition goals select" ON public.nutrition_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Nutrition goals insert" ON public.nutrition_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Nutrition goals update" ON public.nutrition_goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Nutrition goals delete" ON public.nutrition_goals FOR DELETE USING (auth.uid() = user_id);
