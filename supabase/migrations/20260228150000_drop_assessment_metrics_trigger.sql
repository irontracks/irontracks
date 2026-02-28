-- Remove o trigger duplicado de cálculo de métricas de avaliação.
--
-- Os cálculos são realizados exclusivamente no TypeScript
-- (src/utils/calculations/bodyComposition.ts via src/hooks/useAssessment.ts)
-- e os valores já calculados são enviados no payload do INSERT/UPDATE.
--
-- Vantagens de remover o trigger:
--  - Lógica única: clamping de density [1.0, 1.1] e body_fat [3%, 50%] preservados
--  - Sem resultado incorreto quando dobras são parciais (trigger somava 0 via COALESCE)
--  - Manutenção em um único lugar
--
-- Os dados históricos já gravados são válidos — mesmas fórmulas foram usadas.

DROP TRIGGER IF EXISTS calculate_assessment_metrics_trigger ON assessments;
DROP FUNCTION IF EXISTS calculate_assessment_metrics();
