## Escolha do próximo épico
- Recomendo **Stories/Relatórios V2** como próximo épico porque já temos o fluxo ponta‑a‑ponta (UI + APIs + Storage) e dá para evoluir com mudanças incrementais e baixo risco.
- **Offline Sync V2** continua no radar, mas é mais arriscado (conflitos/replay/observabilidade) e vale fazer em fases depois.

## Objetivo do épico (resultado visível)
- Pós‑treino vira “1 clique” para:
  - gerar um story pronto do treino
  - compartilhar/baixar
  - (opcional) publicar no IronTracks (24h)
- Relatório semanal vira “1 página” rápida (export/share) com insights simples e acionáveis.

## Implementação (segura, com flags)
### 1) Flags de produto (padrão OFF)
- Adicionar em `user_settings.preferences`:
  - `featureStoriesV2` (ou `featurePostWorkoutStoryPrompt`)
  - `featureWeeklyReportCTA`
- Reutilizar o kill switch já existente.
- Arquivos:
  - `DEFAULT_SETTINGS` em [useUserSettings.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/hooks/useUserSettings.js)
  - UI de toggles (admin/teacher) em [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/SettingsModal.js)

### 2) Pós‑treino: “Criar story do treino” (1 tap)
- Ao finalizar e abrir o relatório, mostrar um CTA discreto (ou modal leve) com:
  - “Criar story agora” → abre `StoryComposer` já com template do treino
  - “Agora não”
- Onde plugar:
  - [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.js) (já integra com StoryComposer)
  - Se fizer sentido, também considerar o gancho de finalização em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L430-L546) (mas preferir dentro do Report para não alterar fluxo crítico)

### 3) “Story do time” quando TeamWorkout estiver ativo
- Se existir `teamSession.id` e participantes, incluir no template do story:
  - contagem de participantes
  - nomes/avatares (quando possível)
- Fonte dos dados:
  - `useTeamWorkout()` no contexto já fornece `teamSession`.
  - Template final continua sendo gerado no `StoryComposer`.

### 4) Relatório semanal: CTA e melhorias de conteúdo
- Expor no Histórico um CTA mais óbvio “Relatório da semana” com:
  - export/share
  - insights simples (consistência, volume, PRs, músculos mais treinados)
- Melhorar texto/layout do HTML e insights:
  - HTML: [buildPeriodReportHtml.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/report/buildPeriodReportHtml.js)
  - Insights: [generatePeriodReportInsights](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/actions/workout-actions.js)
  - UI: [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/HistoryList.js)

## Critérios de pronto (não quebra)
- Flags OFF: app se comporta exatamente como hoje.
- Flags ON: pós‑treino mostra CTA e abre StoryComposer sem bugs de preview.
- Export semanal continua funcionando e com layout estável.
- Lint/build passando + smoke test: login, iniciar treino, finalizar, abrir report, publicar story.

Se confirmar, eu implemento nessa ordem (flags → CTA pós‑treino → story do time → melhorias do semanal) e valido tudo com lint/build e teste manual no dev.