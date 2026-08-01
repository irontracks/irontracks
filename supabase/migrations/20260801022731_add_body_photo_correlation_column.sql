-- Correlação treino × laudo da Avaliação por Foto.
--
-- Até aqui a correlação era on-demand e efêmera: o usuário clicava, lia, fechava
-- o modal e perdia o resultado — não havia onde guardar. Esta coluna passa a
-- reter a ÚLTIMA correlação de cada laudo, para a tela reabrir sem custo de IA.
--
-- Aditiva e nulável: nenhuma linha existente muda, e reverter é um DROP COLUMN.
-- Herda as policies de body_photo_assessments (owner + trainer com vínculo vivo).
alter table public.body_photo_assessments
  add column if not exists correlation jsonb;

comment on column public.body_photo_assessments.correlation is
  'Última correlação treino × laudo: { correlation, window, generatedAt }. Gravada pela rota /api/ai/body-composition-correlation via service-role. Nula até o usuário pedir a primeira. Recalculável — o conteúdo envelhece conforme a pessoa treina.';
