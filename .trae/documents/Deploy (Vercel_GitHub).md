## Contexto do projeto
- O script `npm run deploy` está bloqueado e o deploy é automático via GitHub (push/commit na branch de deploy).

## Plano de Deploy
### 1) Verificações rápidas (antes do push)
- Confirmar que o build está passando (já passou localmente) e que não há erros de TypeScript.
- Rodar um `git status` para ver o que ficou pendente de commit após as últimas correções.

### 2) Commit das correções
- Criar um commit único com as mudanças pós-snapshot (câmera Info.plist, IAP/RevenueCat, ajustes Sign in with Apple, endpoint de sync, etc.).

### 3) Push para o GitHub
- Fazer `git push origin HEAD` na branch atual (isso deve disparar o deploy automático).

### 4) Checagem pós-deploy
- Validar que a build finalizou na Vercel e que o ambiente está ok (abrir a URL do app e checar rota `/marketplace` e `/auth/login?provider=apple`).

Se aprovar, eu executo esses passos agora (commit + push) para disparar o deploy automático.