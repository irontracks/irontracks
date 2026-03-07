## Diagnóstico
- No histórico de avaliações, o botão **Plano Tático (AI)** chama `handleGenerateAssessmentPlan(assessment)`.
- Essa função faz `setSelectedAssessment(id)` no início, o que dá a mesma sensação do botão **Detalhes** (abrir/mostrar o card expandido). O plano só aparece dentro da área expandida.

## Correção proposta
- Separar claramente as ações:
  - **Detalhes**: continua apenas alternando `selectedAssessment`.
  - **Plano Tático (AI)**: abre um **modal próprio** “Plano Tático” e dispara a geração/visualização do plano ali, sem mexer em `selectedAssessment`.

## Implementação
1) Em [AssessmentHistory.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentHistory.tsx):
   - Criar estados para o modal do plano: `planModalOpen`, `planModalAssessmentId`.
   - Criar um handler `handleOpenAssessmentPlan(assessment)` que:
     - define `planModalAssessmentId` e `planModalOpen=true`.
     - chama `generateAssessmentPlanAi(...)` e popula `aiPlanByAssessmentId[id]` (reaproveitando a lógica atual, mas **sem** `setSelectedAssessment`).
   - Ajustar o botão **Plano Tático (AI)** para chamar `handleOpenAssessmentPlan`.
2) Renderizar o modal do plano usando o mesmo estado `aiPlanByAssessmentId[id]` (loading/erro/plan) e exibir o conteúdo.
3) Garantir que o botão “Plano Tático” não acione “Detalhes” por acidente (apenas o modal).

## Validação
- Abrir a aba Avaliações e testar:
  - Clicar **Detalhes**: expande/colapsa sem gerar plano.
  - Clicar **Plano Tático (AI)**: abre modal e mostra loading → plano (ou erro), sem expandir detalhes.
- Rodar `npm run lint` e `npm run build`.