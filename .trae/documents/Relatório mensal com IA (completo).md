## Objetivo
- Evoluir o **Relatório mensal** para um relatório “completo” com IA: evolução, pontos fortes, o que melhorar e dicas práticas para evoluir mais.
- Manter compatibilidade com o PDF atual e ter fallback caso a IA falhe.

## Como o relatório funciona hoje (base)
- UI chama `openPeriodReport('month')` em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L661-L685).
- Gera stats no client e usa um gerador heurístico (sem LLM): [generatePeriodReportInsights](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L491-L548).
- PDF é montado por [buildPeriodReportHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildPeriodReportHtml.js) e convertido em `/api/report`.

## Implementação (passo a passo)
### 1) Criar endpoint de IA para relatório do período
- Criar `POST /api/ai/period-report` (novo) usando o mesmo provider do app (Gemini via `@google/generative-ai`, como em [post-workout-insights](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/post-workout-insights/route.ts)).
- Entrada do endpoint:
  - `type: 'month' | 'week'`
  - `stats` (o objeto já calculado hoje)
  - `sessions` (lista reduzida de `sessionSummaries`)
  - `topByVolume` e `topByFrequency`
  - (opcional, mas recomendado) `workoutIds` do período para buscar check-ins no servidor
- No servidor (com service role), buscar e agregar check-ins (`workout_checkins`) quando vierem `workoutIds`.
- Saída padronizada para UI/PDF:
  - `title`
  - `summary[]`
  - `highlights[]`
  - `evolution[]` (tendência/consistência/progresso)
  - `improvements[]` (o que melhorar)
  - `tips[]` (dicas práticas)
  - `nextSteps[]` (plano para o próximo mês)
  - `warnings[]` (atenções/recuperação/risco)
- Implementar normalização/limites (arrays com tamanho máximo) e extração robusta de JSON (igual ao padrão existente no post-workout-insights).

### 2) Trocar o relatório mensal para usar IA (com fallback)
- Em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L661-L681), quando `type === 'month'`:
  - chamar `fetch('/api/ai/period-report')`
  - se falhar, cair no `generatePeriodReportInsights()` atual (para nunca travar).

### 3) Atualizar o PDF do relatório para exibir as novas seções
- Em [buildPeriodReportHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildPeriodReportHtml.js):
  - manter seções atuais (Resumo/Destaques/Foco/Próximos passos/Atenções)
  - adicionar novas seções quando existirem:
    - `Evolução (IA)` ← `evolution[]`
    - `O que melhorar (IA)` ← `improvements[]`
    - `Dicas para evoluir mais (IA)` ← `tips[]`
    - `Plano para o próximo mês (IA)` ← `nextSteps[]` (ou separado se preferir)

### 4) (Opcional) Enriquecer com mais “sobre tudo”
- Se você quiser ainda mais completo, dá para incluir também no payload:
  - “divisão de dias treinados na semana” (a partir de `sessionSummaries`)
  - um resumo de muscle map do mês (criando um endpoint mês ou chamando o semanal e consolidando)
  - ranking de progresso por exercícios (quando existir histórico suficiente)

## Validação
- Gerar relatório mensal com treinos reais no histórico.
- Confirmar que:
  - o modal mostra as seções novas
  - o PDF exportado inclui as seções novas
  - se o endpoint de IA falhar, o relatório volta automaticamente ao fallback atual

Se você aprovar, eu implemento o endpoint `/api/ai/period-report`, faço a troca no `HistoryList` e atualizo o HTML do PDF para exibir todas as novas seções.