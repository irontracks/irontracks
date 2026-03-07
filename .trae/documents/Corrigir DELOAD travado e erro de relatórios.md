## Diagnóstico (raiz do problema)
- O spinner do botão usa `isReportLoading = reportHistoryStatus.status === 'loading' && !reportHistoryUpdatedAt` em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L2344-L2436). Se `reportHistoryStatus` fica preso em `loading` e `reportHistoryUpdatedAt` permanece `0`, o loader vira “infinito”.
- O erro “Sugestões aplicadas em marca d’água… Deload indisponível: sem carga…” vem de [buildDeloadSuggestion](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L958-L1025), que hoje só aceita baseWeight vindo de: relatório (reportHistory), logs atuais ou plano. Se nenhum tem carga, ele falha.
- A mensagem “Relatórios ainda carregando.” é anexada quando `reportHistoryStatus.status === 'loading'` em [openDeloadModal](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L1078-L1217).

## Mudanças (cirúrgicas, sem mexer no modal)
- Ajustar o carregamento de relatórios para nunca ficar preso em `loading`:
  - Criar um “watchdog” (timestamp/ref) para forçar transição para `error` após timeout real, e também preencher `reportHistoryUpdatedAt` em casos de erro/timeout.
  - Garantir que qualquer caminho de timeout/cancelamento não deixe `status=loading` indefinidamente.
  - Ajustar `isReportLoading` para refletir “carregamento real” (ex.: baseado em `reportHistoryLoadingRef.current`), evitando spinner infinito mesmo se o status travar.

- Tornar o Deload completo possível quando só existe sugestão de IA (marca d’água):
  - Expandir `buildDeloadSuggestion` para aceitar um `baseWeightFromAi` (quando disponível) como fallback após histórico/logs/plano.
  - Em `openDeloadModal`, reaproveitar o `aiSuggestion` já resolvido e passá-lo para `buildDeloadSuggestion`.

- Melhorar a mensagem para remover duplicação “Deload completo indisponível: Deload indisponível: …”:
  - Normalizar a string final removendo prefixo repetido.

## Arquivo que será alterado
- Apenas [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js) (escopo restrito).

## Validação
- Manual:
  - Entrar no treino e observar que o botão “Aplicar Deload” não fica preso em “Carregando” após timeout.
  - Testar exercício sem carga no plano/logs, com relatório carregando: deve parar o loading e exibir feedback coerente.
  - Testar cenário com sugestão de IA disponível: deload completo deve abrir e permitir aplicar.
- Automatizado (já existente no repo): rodar `npm run e2e:deload` para garantir que os cenários continuam passando.

## Observação de regra do modal
- Não vou alterar estrutura do modal; somente lógica de carregamento/decisão e mensagens, mantendo o modal como está e apenas habilitando o fluxo quando possível.