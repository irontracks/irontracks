-- Associa um código de barras (EAN/UPC) a um alimento da biblioteca do usuário.
-- Permite que um produto cadastrado (via scanner da tabela nutricional) seja
-- reconhecido na próxima leitura do código — inclusive os que o Open Food Facts
-- não tem (comum em produtos brasileiros). Nullable; alimentos sem código ficam null.
ALTER TABLE public.nutrition_custom_foods
  ADD COLUMN IF NOT EXISTS barcode text;

-- Lookup rápido por (user, barcode) na hora de resolver uma leitura.
CREATE INDEX IF NOT EXISTS nutrition_custom_foods_user_barcode_idx
  ON public.nutrition_custom_foods (user_id, barcode)
  WHERE barcode IS NOT NULL;
