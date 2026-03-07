## O que vai mudar
- O Relatório mensal deixa de ser “heurístico” e passa a ser gerado por IA, cobrindo:
  - evolução do mês
  - o que precisa melhorar
  - dicas práticas para evoluir mais
  - próximos passos (plano do próximo mês)
  - atenções (recuperação/risco)
- Continua existindo fallback (se a IA falhar, cai no relatório atual).

## Implementação
### 1) Novo endpoint de IA do relatório mensal
- Criar `POST /api/ai/period-report`.
- Autenticação: `requireUser()`.
- Provider: Gemini (`@google/generative-ai`) usando a mesma env `GOOGLE_GENERATIVE_AI_API_KEY` e o mesmo padrão robusto de “retornar JSON puro” usado em [post-workout-insights](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/post-workout-insights/route.ts).
- Input do endpoint:
  - `type` (week/month)
  - `stats` (obj já calculado no client)
  - `sessionSummaries` (lista do período)
  - `topExercisesByVolume` e `topExercisesByFrequency`
- Enriquecimento “sobre tudo” (server-side): buscar e agregar `workout_checkins` no range do mês (por `user_id` e `created_at`) e incluir um `checkinsSummary` no prompt (médias/tendências/alertas).
- Output padronizado:
  - `title`
  - `summary[]`
  - `highlights[]`
  - `evolution[]`
  - `improvements[]`
  - `tips[]`
  - `nextSteps[]`
  - `warnings[]`
- Normalização/limites por seção (para não estourar UI/PDF) e extração de JSON do texto (igual ao padrão do app).

### 2) Integrar no modal do Relatório mensal
- Em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js#L661-L681), quando `type === 'month'`:
  - chamar `/api/ai/period-report`
  - se falhar, usar `generatePeriodReportInsights()` atual
- Atualizar o modal para mostrar as novas seções (Evolução / Melhorar / Dicas / Plano).

### 3) Atualizar o PDF
- Em [buildPeriodReportHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildPeriodReportHtml.js), adicionar as novas seções usando os novos arrays da IA.
- Manter compatibilidade com o formato antigo (para relatórios gerados sem IA ou fallback).

### 4) Validação
- Rodar lint/build.
- Gerar relatório mensal no app e exportar PDF.
- Confirmar:
  - IA aparece no modal
  - PDF contém seções novas
  - fallback funciona se a IA estiver sem chave/config.
