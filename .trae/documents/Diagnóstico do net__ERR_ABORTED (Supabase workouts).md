## O Que Esse Erro Significa
- Explicar que net::ERR_ABORTED é cancelamento do request pelo navegador (não é status HTTP), com causas comuns: navegação/redirect, refresh, componente desmontando, perda de sessão, CORS/bloqueio.

## Onde Isso Acontece No Código
- Mapear o ponto principal que consulta `workouts` no client (WorkoutReport) e os redirects de auth no dashboard que podem abortar requests.

## Como Vou Confirmar a Causa
- Reproduzir com Network aberto e verificar se o request aparece como “(canceled)” e se há redirect para `/?next=/dashboard` no mesmo instante.
- Checar resposta/headers quando não é cancelado (401/403 vs 200) e se cookies/sessão estão ok.

## Correção
- Garantir que a query de `workouts` só rode quando `user` e `targetUserId` existirem e auth estiver estável.
- Tratar abort com `try/catch` e ignorar `AbortError`/cancelamentos (não logar como erro).
- Se o cancelamento vier de redirect por sessão perdida, ajustar o fluxo de auth para não disparar redirect enquanto o dashboard está carregando dados (ou mover a query para endpoint server-side com cookies).

## Validação
- Confirmar que o console não mostra mais net::ERR_ABORTED em navegação normal.
- Confirmar que, sem sessão, o app redireciona sem spam de erro.
- Confirmar que, com sessão válida, a lista/relatório carrega e o request retorna 200.