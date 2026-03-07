## O que ficou FORA do rollback (ou seja, foi aplicado depois)
- Só 2 mudanças de UI:
  - [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js): CTAs em 2 colunas (Vídeo/Pesos) + badge CLUSTER sem cortar.
  - [ExecutionVideoCapture.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExecutionVideoCapture.js): novo variant “compact” (mesma ação, visual discreto).

## O que NÃO está nesse estado (foi descartado no rollback)
- Tudo que eu tinha criado/alterado para “consertar build” e “UI preview”, incluindo:
  - Rota de preview `/auth/ui-preview/active-workout`.
  - Arquivos/renomes “sem extensão” → `.ts` e outras limpezas de rotas/layout.
  - Qualquer ajuste extra em login/dashboard/auth que eu tinha feito naquela tentativa.

## Como eu confirmo isso 100% (sem achismo)
1) Comparar o estado atual com o branch de restauração `pre-ui-fix-*` (diff) e gerar uma lista exata de arquivos/linhas.
2) Te enviar essa lista e, se você quiser, criar um segundo branch “apenas UI treino” ou desfazer até essas 2 mudanças.
3) Se for reintroduzir algo antigo, aplicar uma coisa por vez com snapshot antes e validação (lint/build + teste no mobile).