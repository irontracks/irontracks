-- Detalhamento dos alimentos de cada refeição lançada.
-- Guarda o breakdown por item (nome, gramas, kcal, P/C/G) para que o card
-- expandido mostre os alimentos, não só os macros totais. Nullable e sem
-- default — refeições antigas seguem com items = null (exibem só os macros).
-- Formato: [{ "label": string, "grams": number, "calories": number,
--            "protein": number, "carbs": number, "fat": number }, ...]
ALTER TABLE public.nutrition_meal_entries
  ADD COLUMN IF NOT EXISTS items jsonb;
