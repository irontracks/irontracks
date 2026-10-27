-- Avaliação por DEXA (laudo de exame de imagem) — tipo próprio em `assessments`.
--
-- ORDEM DE ENTREGA (importa): o código que reconhece 'dexa' vai ao ar ANTES desta
-- migration, e a LINHA do laudo só é inserida DEPOIS dela. Um 'dexa' gravado com
-- código velho no ar apareceria como avaliação por dobras (17,0% na curva dos 5,8%).
--
-- O que muda:
--   1. `assessments_type_chk` passa a aceitar 'dexa'.
--   2. 11 colunas `dexa_*`, todas NULAS, com a unidade e a fonte no comentário.
--      Colunas e não jsonb: cada número tem faixa válida (CHECK), é consultável e
--      segue o padrão das 6 colunas `bia_*`.
--   3. Três travas que impedem um DEXA de se passar por outro método pelos dados.
--
-- RLS: nada muda. As políticas são por LINHA (user_id/student_id/trainer_id) e
-- colunas novas herdam o mesmo acesso.
--
-- ROLLBACK (na ordem inversa da entrega: linha → migration → código):
--   DELETE FROM public.assessments WHERE assessment_type = 'dexa';  -- só com confirmação
--   ALTER TABLE public.assessments
--     DROP CONSTRAINT IF EXISTS assessments_dexa_ranges_chk,
--     DROP CONSTRAINT IF EXISTS assessments_dexa_cols_only_dexa_chk,
--     DROP CONSTRAINT IF EXISTS assessments_dexa_not_bia_chk,
--     DROP CONSTRAINT IF EXISTS assessments_type_chk;
--   ALTER TABLE public.assessments ADD CONSTRAINT assessments_type_chk
--     CHECK (assessment_type IN ('full', 'bia'));
--   ALTER TABLE public.assessments
--     DROP COLUMN IF EXISTS dexa_asmi, DROP COLUMN IF EXISTS dexa_fmi,
--     DROP COLUMN IF EXISTS dexa_appendicular_lean_kg, DROP COLUMN IF EXISTS dexa_bone_mass_kg,
--     DROP COLUMN IF EXISTS dexa_bone_density, DROP COLUMN IF EXISTS dexa_android_fat_pct,
--     DROP COLUMN IF EXISTS dexa_gynoid_fat_pct, DROP COLUMN IF EXISTS dexa_arms_fat_pct,
--     DROP COLUMN IF EXISTS dexa_legs_fat_pct, DROP COLUMN IF EXISTS dexa_trunk_fat_pct,
--     DROP COLUMN IF EXISTS dexa_device;
--   (salve antes um SELECT das colunas dexa_* — o DROP COLUMN não tem volta)

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS dexa_asmi numeric,
  ADD COLUMN IF NOT EXISTS dexa_fmi numeric,
  ADD COLUMN IF NOT EXISTS dexa_appendicular_lean_kg numeric,
  ADD COLUMN IF NOT EXISTS dexa_bone_mass_kg numeric,
  ADD COLUMN IF NOT EXISTS dexa_bone_density numeric,
  ADD COLUMN IF NOT EXISTS dexa_android_fat_pct numeric,
  ADD COLUMN IF NOT EXISTS dexa_gynoid_fat_pct numeric,
  ADD COLUMN IF NOT EXISTS dexa_arms_fat_pct numeric,
  ADD COLUMN IF NOT EXISTS dexa_legs_fat_pct numeric,
  ADD COLUMN IF NOT EXISTS dexa_trunk_fat_pct numeric,
  ADD COLUMN IF NOT EXISTS dexa_device text;

COMMENT ON COLUMN public.assessments.dexa_asmi IS
  'DEXA: índice de massa magra apendicular (ASMI), kg/m². Valor do laudo — não recalcular.';
COMMENT ON COLUMN public.assessments.dexa_fmi IS
  'DEXA: índice de massa gorda (FMI), kg/m². Valor do laudo — o laudo trunca (5,4), recalcular daria 5,46.';
COMMENT ON COLUMN public.assessments.dexa_appendicular_lean_kg IS
  'DEXA: massa magra apendicular (braços + pernas), kg.';
COMMENT ON COLUMN public.assessments.dexa_bone_mass_kg IS
  'DEXA: conteúdo mineral ósseo total (BMC), kg. A lean_mass do DEXA EXCLUI o osso.';
COMMENT ON COLUMN public.assessments.dexa_bone_density IS
  'DEXA: densidade mineral óssea total (DMO), g/cm².';
COMMENT ON COLUMN public.assessments.dexa_android_fat_pct IS
  'DEXA: % de gordura da região andróide. A relação andróide/ginóide é derivada na leitura (não é coluna).';
COMMENT ON COLUMN public.assessments.dexa_gynoid_fat_pct IS
  'DEXA: % de gordura da região ginóide.';
COMMENT ON COLUMN public.assessments.dexa_arms_fat_pct IS
  'DEXA: % de gordura dos braços.';
COMMENT ON COLUMN public.assessments.dexa_legs_fat_pct IS
  'DEXA: % de gordura das pernas.';
COMMENT ON COLUMN public.assessments.dexa_trunk_fat_pct IS
  'DEXA: % de gordura do tronco.';
COMMENT ON COLUMN public.assessments.dexa_device IS
  'DEXA: aparelho e clínica (ex.: Lunar Prodigy Primo, CEMED). DEXAs de máquinas diferentes não são equivalentes.';

COMMENT ON COLUMN public.assessments.assessment_type IS
  '''full'' = avaliação completa (dobras + medidas + opcionalmente BIA). ''bia'' = registro standalone só de bioimpedância (do PDF da máquina externa). ''dexa'' = laudo de DEXA: método próprio, nunca pareia nem se compara com dobras/BIA.';

ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_type_chk;
ALTER TABLE public.assessments ADD CONSTRAINT assessments_type_chk
  CHECK (assessment_type IN ('full', 'bia', 'dexa'));

-- Faixas válidas (NULL passa: coluna opcional).
ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_dexa_ranges_chk;
ALTER TABLE public.assessments ADD CONSTRAINT assessments_dexa_ranges_chk CHECK (
  (dexa_asmi IS NULL OR dexa_asmi BETWEEN 0 AND 30)
  AND (dexa_fmi IS NULL OR dexa_fmi BETWEEN 0 AND 30)
  AND (dexa_appendicular_lean_kg IS NULL OR dexa_appendicular_lean_kg BETWEEN 0 AND 100)
  AND (dexa_bone_mass_kg IS NULL OR dexa_bone_mass_kg BETWEEN 0 AND 15)
  AND (dexa_bone_density IS NULL OR dexa_bone_density BETWEEN 0 AND 3)
  AND (dexa_android_fat_pct IS NULL OR dexa_android_fat_pct BETWEEN 0 AND 100)
  AND (dexa_gynoid_fat_pct IS NULL OR dexa_gynoid_fat_pct BETWEEN 0 AND 100)
  AND (dexa_arms_fat_pct IS NULL OR dexa_arms_fat_pct BETWEEN 0 AND 100)
  AND (dexa_legs_fat_pct IS NULL OR dexa_legs_fat_pct BETWEEN 0 AND 100)
  AND (dexa_trunk_fat_pct IS NULL OR dexa_trunk_fat_pct BETWEEN 0 AND 100)
);

-- Coluna de DEXA só em linha de DEXA.
ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_dexa_cols_only_dexa_chk;
ALTER TABLE public.assessments ADD CONSTRAINT assessments_dexa_cols_only_dexa_chk CHECK (
  assessment_type = 'dexa'
  OR (dexa_asmi IS NULL AND dexa_fmi IS NULL AND dexa_appendicular_lean_kg IS NULL
      AND dexa_bone_mass_kg IS NULL AND dexa_bone_density IS NULL
      AND dexa_android_fat_pct IS NULL AND dexa_gynoid_fat_pct IS NULL
      AND dexa_arms_fat_pct IS NULL AND dexa_legs_fat_pct IS NULL
      AND dexa_trunk_fat_pct IS NULL AND dexa_device IS NULL)
);

-- Um DEXA não carrega leitura de BIA nem de dobras: `assessmentMethod()` olharia
-- essas colunas se o tipo falhasse, e o laudo viraria 'bia' ou 'misto' pelos dados.
ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_dexa_not_bia_chk;
ALTER TABLE public.assessments ADD CONSTRAINT assessments_dexa_not_bia_chk CHECK (
  assessment_type <> 'dexa'
  OR (bia_body_fat_percentage IS NULL AND body_fat_percentage_skinfold IS NULL)
);
