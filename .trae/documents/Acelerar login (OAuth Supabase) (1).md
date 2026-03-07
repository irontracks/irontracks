## Onde está a lentidão hoje
- O fluxo de Google OAuth passa por:
  - clique → `/auth/login` (server) → Google
  - Google → `/auth/callback` (server) → `exchangeCodeForSession(code)` → redirect
- No callback, existe uma chamada extra que adiciona latência sem ganho real:
  - `exchangeCodeForSession` (necessária) + `auth.getUser()` (redundante) em [auth/callback/route.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/callback/route.js#L77-L85).
- Na tela inicial, cada visita a `/` faz `supabase.auth.getUser()` no server antes de renderizar, o que pode atrasar a tela de login em redes lentas: [page.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/page.tsx#L24-L30) e [/(public)/page.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(public)/page.tsx#L23-L29).

## Plano de otimização (mudanças pequenas e seguras)
### 1) Reduzir 1 round-trip no caminho crítico (callback)
- Alterar `/auth/callback` para:
  - fazer apenas `exchangeCodeForSession(code)`
  - remover o `supabase.auth.getUser()` best-effort após o exchange
- Ganho: reduz tempo entre “voltar do Google” e chegar no `/dashboard`.

### 2) Tornar a tela de login mais “instantânea” (primeiro paint)
- Trocar o ícone do Google de remoto/otimizado por um asset local ou SVG inline em [LoginScreen.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.js#L57-L58).
- Ganho: menos request/overhead no primeiro carregamento do botão.

### 3) (Opcional, recomendado) Evitar bloquear a home por `getUser()`
- Ajustar a landing (`/` e `/(public)`) para não depender de `auth.getUser()` para renderizar a UI:
  - renderizar o `LoginScreen` imediatamente
  - se já estiver logado, fazer redirect por um guard mais “barato” (ex.: no client) ou consolidar a verificação em um único ponto.
- Ganho: melhora TTFB e sensação de velocidade antes do login.

### 4) Validação
- Testar fluxo completo:
  - abrir `/` (render rápido)
  - clicar login → ir ao Google
  - voltar via `/auth/callback` → cair em `/dashboard` mais rápido
- Rodar lint/build.

Se você confirmar, eu implemento os itens 1 e 2 imediatamente (ganho direto) e deixo o item 3 como melhoria opcional por ser uma decisão de UX (priorizar render rápido vs redirect imediato).