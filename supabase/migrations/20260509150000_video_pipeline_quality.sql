-- Pipeline IA de vídeos demonstrativos — schema de suporte.
--
-- Contexto: 188 dos 251 exercícios da biblioteca não têm vídeo (75%
-- de buracos). O fluxo manual atual exige clicar exercício por
-- exercício, gerar sugestão, aprovar manualmente — inviável em escala.
--
-- Pipeline novo (servidor decide auto-aprovar via score):
--   1. Cron/botão pega exercícios sem vídeo
--   2. Gemini gera queries → YouTube retorna candidatos
--   3. Gemini avalia cada candidato → score 0-100
--      - Canal whitelisted? +30
--      - Título bate com o exercício? +0-30
--      - Duração razoável (30s-5min)? +0-20
--      - View count / engajamento? +0-20
--   4. Decisão:
--      - score >= 80 → auto-aprovado (vira primary)
--      - score 50-79 → pending pra revisão humana
--      - score < 50 → descartado
--
-- Mudanças neste arquivo
-- ──────────────────────
-- 1. exercise_videos ganha 'quality_score' e 'auto_approved' pra
--    rastreabilidade — saber QUAL IA aprovou cada vídeo e com qual
--    confiança.
-- 2. Nova tabela video_channel_whitelist — canais BR e internacionais
--    que treinam corretamente. Cada canal tem categoria (musculacao,
--    funcional, calistenia, etc.) e nível de confiança.

-- ── 1. Colunas em exercise_videos ──────────────────────────────────
ALTER TABLE public.exercise_videos
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb;

COMMENT ON COLUMN public.exercise_videos.quality_score IS
  'Score 0-100 atribuído pela IA. NULL = não passou pelo pipeline.';
COMMENT ON COLUMN public.exercise_videos.auto_approved IS
  'TRUE quando o pipeline auto-aprovou (score >= 80). Diferencia de aprovação manual via UI.';
COMMENT ON COLUMN public.exercise_videos.score_breakdown IS
  'JSON com a decomposição do score — channel_bonus, title_match, duration, etc. — pra auditoria.';

-- Índice pra a query "vídeos pendentes de revisão humana" ser rápida.
CREATE INDEX IF NOT EXISTS exercise_videos_pending_review_idx
  ON public.exercise_videos (status, quality_score)
  WHERE status = 'pending';

-- ── 2. Whitelist de canais ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_channel_whitelist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ID do canal no YouTube (ex: UCabc123...). Único — não pode ter
  -- o mesmo canal duas vezes.
  provider text NOT NULL DEFAULT 'youtube',
  channel_id text NOT NULL,
  -- Nome de exibição pra UI/log
  channel_name text NOT NULL,
  -- Categoria pra filtrar buscas por nicho (musculacao, funcional, etc.)
  category text NOT NULL DEFAULT 'musculacao',
  -- Nível de confiança: 'high' (canais grandes e fiéis à técnica),
  -- 'medium' (bons mas algumas inconsistências), 'low' (só pra fallback)
  trust_level text NOT NULL DEFAULT 'high' CHECK (trust_level IN ('high', 'medium', 'low')),
  -- Idioma principal do canal
  language text NOT NULL DEFAULT 'pt-BR',
  -- Notas opcionais (ex: "Mestre em biomecânica", "Personal trainer USP")
  notes text,
  -- Quando blacklisted, ignora vídeos desse canal no pipeline
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (provider, channel_id)
);

COMMENT ON TABLE public.video_channel_whitelist IS
  'Canais confiáveis pra busca de vídeos demonstrativos. O pipeline IA dá bonus +30 no score pra vídeos vindos desses canais.';

CREATE INDEX IF NOT EXISTS video_channel_whitelist_active_idx
  ON public.video_channel_whitelist (provider, is_active)
  WHERE is_active = true;

-- RLS — só admin pode gerenciar a whitelist
ALTER TABLE public.video_channel_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_whitelist_admin_all" ON public.video_channel_whitelist;
CREATE POLICY "channel_whitelist_admin_all"
  ON public.video_channel_whitelist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Trigger pra atualizar updated_at
CREATE OR REPLACE FUNCTION public.video_channel_whitelist_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_channel_whitelist_touch ON public.video_channel_whitelist;
CREATE TRIGGER video_channel_whitelist_touch
  BEFORE UPDATE ON public.video_channel_whitelist
  FOR EACH ROW EXECUTE FUNCTION public.video_channel_whitelist_touch_updated_at();

-- ── 3. Seed da whitelist com canais BR confiáveis ──────────────────
-- Lista inicial curada — canais grandes que ensinam técnica correta
-- de musculação/treino em PT-BR. Pode ser expandido/editado pela UI
-- da tab Vídeos no admin.

INSERT INTO public.video_channel_whitelist (provider, channel_id, channel_name, category, trust_level, language, notes)
VALUES
  -- ─── BR — Musculação / Hipertrofia (técnica científica) ─────────
  ('youtube', 'UC9NfhRXBtICqyD6XlIeR_lA', 'Leandro Twin', 'musculacao', 'high', 'pt-BR',
   'Conteúdo baseado em evidência, foco em técnica e ciência do treino'),
  ('youtube', 'UCxv6Wq72rUFFXJSAOMjsRzg', 'Renato Cariani — Iron Man', 'musculacao', 'high', 'pt-BR',
   'Bodybuilder com explicações técnicas detalhadas'),
  ('youtube', 'UCxoStA__7P1KH96sIewj4OQ', 'Paulo Muzy', 'musculacao', 'high', 'pt-BR',
   'Médico do esporte, foco em técnica segura e fisiologia'),
  ('youtube', 'UCBJTpZc9wVlpsv78F6YkXVA', 'Brasil Acima do Peso', 'musculacao', 'medium', 'pt-BR',
   'Demonstrações claras de exercícios básicos'),

  -- ─── BR — Funcional / Calistenia ────────────────────────────────
  ('youtube', 'UCkmnDjxpw4USQ6jeI3vS-ig', 'André Cassino', 'funcional', 'medium', 'pt-BR',
   'Treinamento funcional e movimentos compostos'),

  -- ─── Internacional — Referências consagradas ────────────────────
  ('youtube', 'UCe0TLA0EsQbE-MjuHXevj2A', 'ATHLEAN-X', 'musculacao', 'high', 'en',
   'Jeff Cavaliere — fisioterapeuta, explicações biomecânicas precisas'),
  ('youtube', 'UCm9K6rby98W8JigLoZOh6FQ', 'Squat University', 'musculacao', 'high', 'en',
   'Dr. Aaron Horschig — referência mundial em técnica de agachamento e mobilidade'),
  ('youtube', 'UCxFf3oj6Kpz_yLuKVE_q4Sw', 'Jeff Nippard', 'musculacao', 'high', 'en',
   'Conteúdo baseado em estudos científicos, técnica detalhada'),
  ('youtube', 'UCEtMRF1ywKMc4sf3EXYyDzw', 'Calisthenicmovement', 'calistenia', 'high', 'en',
   'Referência em movimentos de peso corporal')
ON CONFLICT (provider, channel_id) DO NOTHING;
