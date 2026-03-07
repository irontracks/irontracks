## Objetivo
- No **Relatório mensal**, a IA deve falar sobre tudo: evolução, pontos fortes, o que precisa melhorar e dicas práticas para evoluir mais.
- Funcionar no modal e também no **PDF**.
- Ter fallback (se IA falhar, ainda gera relatório).

## Base atual (onde mexer)
- Modal do relatório mensal: [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L661-L1319)
- Gerador atual (sem LLM): [generatePeriodReportInsights](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L491-L548)
- PDF/HTML: [buildPeriodReportHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildPeriodReportHtml.js)
- Conversão PDF: [/api/report](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/report/route.js)
- IA já usada no app (padrão Gemini + normalização robusta): [post-workout-insights](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/post-workout-insights/route.ts)

## Implementação
### 1) Criar endpoint novo de IA do período
- Criar `POST /api/ai/period-report`.
- Auth: `requireUser()`.
- Provider: Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`), mesmo padrão do pós-treino.
- Payload de entrada:
  - `type: 'month' | 'week'`
  - `stats` (já calculado hoje)
  - `sessions` (sessionSummaries)
  - `workoutIds` do período (para enriquecer com check-ins, se disponível)
- Enriquecimento (server-side, opcional mas recomendado): buscar e agregar `workout_checkins` do período (pré/pós) e passar no prompt.
- Resposta da IA (JSON estrito) com:
  - `title`
  - `summary[]`
  - `highlights[]`
  - `evolution[]`
  - `improvements[]`
  - `tips[]`
  - `nextSteps[]`
  - `warnings[]`
- Normalizar/limitar tamanho de listas e extrair JSON de forma robusta.

### 2) Integrar IA no relatório mensal (com fallback)
- Em `openPeriodReport(type)`:
  - Montar `stats` + `workoutIds`.
  - Tentar `fetch('/api/ai/period-report')`.
  - Se falhar, cair no `generatePeriodReportInsights()` atual.

### 3) Atualizar o modal para mostrar novas seções
- No bloco “IA • Insights” do modal, renderizar também:
  - Evolução
  - O que melhorar
  - Dicas para evoluir mais
  - Plano do próximo mês

### 4) Atualizar o PDF
- Em `buildPeriodReportHtml`, adicionar seções quando existirem:
  - Evolução (IA)
  - O que melhorar (IA)
  - Dicas para evoluir mais (IA)
  - Plano do próximo mês (IA)
- Manter as seções antigas para compatibilidade.

## Validação
- Rodar lint/build.
- Gerar relatório mensal e baixar PDF.
- Verificar fallback quando a chave de IA não estiver configurada.
