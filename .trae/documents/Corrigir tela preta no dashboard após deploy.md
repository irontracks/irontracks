## Diagnóstico (por que fica preto)
- No client do dashboard existe um trecho que literalmente faz **renderizar nada** quando `user` está vazio: `if (!user) return null;` em [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js#L1958-L1960). Em produção, se a sessão não hidratar no client (cookie/storage/SSR↔client mismatch), isso vira uma tela preta.
- Além disso, o diretório do dashboard está com **múltiplas entradas** para o mesmo componente: `IronTracksAppClient` (sem extensão), `IronTracksAppClient 2.js`, `IronTracksAppClient 3.js`, `IronTracksAppClient.js` ([lista do diretório](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/)). Isso é um risco alto em deploy (resolução de módulo/chunks inconsistentes e cache), e pode resultar em tela preta/loop sem erro visível.

## Objetivo
- Garantir que, mesmo se a sessão do Supabase falhar no client, o usuário **nunca** veja “tela preta”: ou mostra loading, ou redireciona para login.
- Eliminar ambiguidade de imports para evitar problemas de chunk/caching no deploy.

## Plano de correção
### 1) Canonizar o componente do dashboard (sem nomes com espaço/duplicatas)
- Escolher 1 arquivo “oficial”, sem espaço no nome, ex.: `IronTracksAppClient.tsx` (ou `.js`) dentro de `src/app/(app)/dashboard/`.
- Atualizar [page.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/page.tsx#L3) para importar **somente** esse arquivo.
- Remover os duplicados `IronTracksAppClient` (sem extensão) e `IronTracksAppClient 2.js` / `IronTracksAppClient 3.js` para não haver duas “versões” competindo.

### 2) Remover o “return null” e colocar fallback + redirect
- Substituir `if (!user) return null;` por:
  - `LoadingScreen` (ou uma tela de “Reautenticando…”) e
  - um `useEffect` que, se `user` continuar null, faz `router.replace('/?next=/dashboard')`.
- Assim, mesmo que o client perca a sessão, ele não fica preto.

### 3) Harden do fluxo de auth client
- Revisar o `onAuthStateChange` + `/api/auth/ping` e garantir que em caso de falha ele **mostre** alguma UI (loading/alert) antes de redirecionar.

### 4) Verificação
- Rodar `npm run build` local.
- Testar fluxo:
  - login → /dashboard
  - refresh em /dashboard
  - abrir em aba anônima
- Depois do deploy, validar em produção:
  - console sem `ChunkLoadError` e sem “tela preta”

Se você confirmar, eu aplico essas mudanças e deixo o dashboard 100% resiliente (sem tela preta) mesmo com falhas de sessão no client.