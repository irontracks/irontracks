CREATE TABLE IF NOT EXISTS public.nutrition_meal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date date NOT NULL,
  food_name text NOT NULL,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_meal_entries_food_name_chk CHECK (length(trim(food_name)) > 0),
  CONSTRAINT nutrition_meal_entries_calories_chk CHECK (calories >= 0),
  CONSTRAINT nutrition_meal_entries_protein_chk CHECK (protein >= 0),
  CONSTRAINT nutrition_meal_entries_carbs_chk CHECK (carbs >= 0),
  CONSTRAINT nutrition_meal_entries_fat_chk CHECK (fat >= 0)
);

CREATE INDEX IF NOT EXISTS nutrition_meal_entries_user_id_date_created_at_idx
  ON public.nutrition_meal_entries (user_id, date, created_at DESC);

ALTER TABLE public.nutrition_meal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nutrition meal entries select" ON public.nutrition_meal_entries;
DROP POLICY IF EXISTS "Nutrition meal entries insert" ON public.nutrition_meal_entries;
DROP POLICY IF EXISTS "Nutrition meal entries update" ON public.nutrition_meal_entries;
DROP POLICY IF EXISTS "Nutrition meal entries delete" ON public.nutrition_meal_entries;

CREATE POLICY "Nutrition meal entries select"
  ON public.nutrition_meal_entries
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Nutrition meal entries insert"
  ON public.nutrition_meal_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nutrition meal entries update"
  ON public.nutrition_meal_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Nutrition meal entries delete"
  ON public.nutrition_meal_entries
  FOR DELETE
  USING (auth.uid() = user_id);

DROP FUNCTION IF EXISTS public.nutrition_add_meal_entry(date, text, numeric, numeric, numeric, numeric);

CREATE FUNCTION public.nutrition_add_meal_entry(
  p_date date,
  p_food_name text,
  p_calories numeric DEFAULT 0,
  p_protein numeric DEFAULT 0,
  p_carbs numeric DEFAULT 0,
  p_fat numeric DEFAULT 0
)
RETURNS TABLE (
  entry_id uuid,
  user_id uuid,
  date date,
  food_name text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  totals_calories numeric,
  totals_protein numeric,
  totals_carbs numeric,
  totals_fat numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_entry public.nutrition_meal_entries%ROWTYPE;
  v_totals record;
  v_lock_key bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'nutrition_invalid_date' USING ERRCODE = '22004';
  END IF;

  IF p_food_name IS NULL OR length(trim(p_food_name)) = 0 THEN
    RAISE EXCEPTION 'nutrition_invalid_food_name' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_calories, 0) < 0 OR coalesce(p_protein, 0) < 0 OR coalesce(p_carbs, 0) < 0 OR coalesce(p_fat, 0) < 0 THEN
    RAISE EXCEPTION 'nutrition_invalid_macros_negative' USING ERRCODE = '22023';
  END IF;

  v_lock_key := ('x' || substr(md5(v_user_id::text || ':' || p_date::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  INSERT INTO public.nutrition_meal_entries (user_id, date, food_name, calories, protein, carbs, fat, updated_at)
  VALUES (v_user_id, p_date, trim(p_food_name), coalesce(p_calories,0), coalesce(p_protein,0), coalesce(p_carbs,0), coalesce(p_fat,0), now())
  RETURNING * INTO v_entry;

  SELECT
    coalesce(sum(e.calories), 0) AS calories,
    coalesce(sum(e.protein), 0) AS protein,
    coalesce(sum(e.carbs), 0) AS carbs,
    coalesce(sum(e.fat), 0) AS fat
  INTO v_totals
  FROM public.nutrition_meal_entries e
  WHERE e.user_id = v_user_id
    AND e.date = p_date;

  INSERT INTO public.daily_nutrition_logs (user_id, date, calories, protein, carbs, fat, updated_at)
  VALUES (v_user_id, p_date, v_totals.calories, v_totals.protein, v_totals.carbs, v_totals.fat, now())
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    calories = EXCLUDED.calories,
    protein  = EXCLUDED.protein,
    carbs    = EXCLUDED.carbs,
    fat      = EXCLUDED.fat,
    updated_at = now();

  entry_id := v_entry.id;
  user_id := v_entry.user_id;
  date := v_entry.date;
  food_name := v_entry.food_name;
  calories := v_entry.calories;
  protein := v_entry.protein;
  carbs := v_entry.carbs;
  fat := v_entry.fat;
  totals_calories := v_totals.calories;
  totals_protein := v_totals.protein;
  totals_carbs := v_totals.carbs;
  totals_fat := v_totals.fat;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.nutrition_add_meal_entry(date, text, numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nutrition_add_meal_entry(date, text, numeric, numeric, numeric, numeric) TO authenticated;

DROP FUNCTION IF EXISTS public.nutrition_delete_meal_entry(uuid);

CREATE FUNCTION public.nutrition_delete_meal_entry(
  p_entry_id uuid
)
RETURNS TABLE (
  deleted_entry_id uuid,
  user_id uuid,
  date date,
  totals_calories numeric,
  totals_protein numeric,
  totals_carbs numeric,
  totals_fat numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_date date;
  v_lock_key bigint;
  v_totals record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'nutrition_invalid_entry_id' USING ERRCODE = '22004';
  END IF;

  SELECT e.date
    INTO v_date
  FROM public.nutrition_meal_entries e
  WHERE e.id = p_entry_id
    AND e.user_id = v_user_id;

  IF v_date IS NULL THEN
    RAISE EXCEPTION 'nutrition_meal_entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_lock_key := ('x' || substr(md5(v_user_id::text || ':' || v_date::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  DELETE FROM public.nutrition_meal_entries e
  WHERE e.id = p_entry_id
    AND e.user_id = v_user_id;

  SELECT
    coalesce(sum(e.calories), 0) AS calories,
    coalesce(sum(e.protein), 0) AS protein,
    coalesce(sum(e.carbs), 0) AS carbs,
    coalesce(sum(e.fat), 0) AS fat
  INTO v_totals
  FROM public.nutrition_meal_entries e
  WHERE e.user_id = v_user_id
    AND e.date = v_date;

  INSERT INTO public.daily_nutrition_logs (user_id, date, calories, protein, carbs, fat, updated_at)
  VALUES (v_user_id, v_date, v_totals.calories, v_totals.protein, v_totals.carbs, v_totals.fat, now())
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    calories = EXCLUDED.calories,
    protein  = EXCLUDED.protein,
    carbs    = EXCLUDED.carbs,
    fat      = EXCLUDED.fat,
    updated_at = now();

  deleted_entry_id := p_entry_id;
  user_id := v_user_id;
  date := v_date;
  totals_calories := v_totals.calories;
  totals_protein := v_totals.protein;
  totals_carbs := v_totals.carbs;
  totals_fat := v_totals.fat;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.nutrition_delete_meal_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nutrition_delete_meal_entry(uuid) TO authenticated;
