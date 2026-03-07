## Diagnóstico (o que existe hoje)
- As “conquistas” são calculadas no client via Server Action [computeWorkoutStreakAndStats](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L413-L505) e **não são persistidas** em tabela própria.
- O ranking global (“Iron Rank”) vem de RPC no Supabase [iron_rank_leaderboard](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260121210000_iron_rank_allow_service_role.sql#L1-L81).
- O volume do usuário para nível/badges vem de RPC [iron_rank_my_total_volume](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260122001500_iron_rank_my_total_volume.sql#L1-L70).

## Pontos de atenção que podem “parecer bug”
- Atualização: `computeWorkoutStreakAndStats()` roda só ao montar o dashboard (depende de `user.id`) em [IronTracksAppClient 4.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%204.js#L1833-L1840). Depois de finalizar um treino, conquistas/streak podem ficar **desatualizadas até recarregar**.
- Timezone: a streak usa `new Date().toISOString().slice(0,10)` (UTC) e converte dias com `T00:00:00Z`, o que pode dar “1 dia a menos/mais” perto da meia-noite local.

## O que vou verificar
1) **RPCs e dados**
- Conferir se `iron_rank_leaderboard` e `iron_rank_my_total_volume` retornam valores coerentes.
- Usar [GET /api/diagnostics/iron-rank](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/diagnostics/iron-rank/route.ts#L1-L117) para validar amostras (sets vs logs legados) e checar erros comuns.

2) **Regras de conquistas**
- Confirmar thresholds implementados (primeiro treino, streak 3/7, volume 5k/20k) e se batem com a UI.
- Validar cálculo de `currentStreak` e `bestStreak` com datas reais (com e sem treino “hoje”).

3) **Fluxo de atualização**
- Identificar o ponto em que um treino é finalizado/criado e garantir que, após isso, o app **recalcula** `streakStats` (sem precisar reload).

## Correções que eu implementaria (se confirmar)
- Recalcular `computeWorkoutStreakAndStats()` automaticamente após:
  - finalizar treino;
  - criar/editar treino (quando impacta volume/logs/sets).
- Ajustar cálculo de streak para usar “dia local do usuário” (ou padronizar pelo campo `workouts.date` se for `date`), evitando off-by-one por UTC.
- Adicionar um pequeno cache/guard para não chamar RPC de volume em loop.

## Validação final
- Testar no dashboard:
  - criar/finalizar treino e ver conquistas/streak atualizarem sem reload;
  - abrir Iron Rank e validar leaderboard;
  - rodar `npm run build`.
