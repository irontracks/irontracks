## Diagnóstico
- A tela renderiza (treinos aparecem), mas menu/avatar/RP não respondem quando o React não hidrata.
- Seus logs apontam para isso: `ChunkLoadError` + `net::ERR_ABORTED` em chunks do Next (`app/global-error.js`, `main-app.js`) e em `/api/version`.
- Isso costuma acontecer por **cache/estado do dev server (.next) + cache do browser**, e (antes) era agravado pelo script de “recovery” no layout.

## O que vou fazer agora
### 1) Reset completo do build do Next no DEV
- Parar o `npm run dev`.
- Apagar a pasta `.next`.
- Subir `npm run dev` novamente.

### 2) Reset de cache do browser
- Hard reload (Cmd+Shift+R).
- Se ainda tiver `ChunkLoadError`, limpar “Site data” (Application → Clear storage).

### 3) Conferir hidratação e cliques
- Validar no navegador:
  - clique no avatar abre menu
  - botão Ferramentas abre
  - módulos de RP/Rank voltam a aparecer
- Se algum endpoint estiver 401/500, eu capturo e corrijo o fluxo específico.

### 4) Ajuste final (se ainda persistir)
- Se o problema continuar mesmo com reset de cache, vou remover qualquer fetch client-side que esteja causando reload/abort e deixar o dashboard 100% SSR para estabilizar.

Se você aprovar, eu executo esses passos (parar dev server, limpar `.next`, reiniciar) e valido aqui.