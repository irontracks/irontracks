## Sim — dá para deixar o login mais rápido
O tempo do Google (OAuth) é inevitável, mas dá para remover latência **do app** que hoje acontece no caminho do login.

### Gargalo atual
- O `middleware` roda em quase tudo e sempre faz `supabase.auth.getUser()` ([middleware.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/middleware.ts#L16-L19), [supabase/middleware.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/middleware.ts#L14-L29)).
- Isso também roda em `/auth/login` e `/auth/callback`, deixando o login mais “demorado” do que precisa.

## E sobre “lembrar o login sempre?”
Hoje o app já tenta persistir por cookie:
- Em produção, `getSupabaseCookieOptions()` define `maxAge/expires` de **1 ano** ([cookieOptions.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/cookieOptions.ts#L24-L35)).
- Em dev (NODE_ENV != production), **não** define `expires/maxAge`, então o cookie pode virar “sessão do navegador” e expirar ao fechar.

Os 2 pontos mais comuns que fazem o usuário “perder login” mesmo em produção:
1) **Domínio/cookie domain inconsistente** (www vs apex)
- Se o cookie ficar host-only e você alterna `www` ↔ `apex`, parece logout.
- Hoje existe redirect `www → irontracks.com.br` no middleware ([middleware.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/middleware.ts#L6-L11)). O ideal é garantir que o cookie seja para `.irontracks.com.br` sempre.

2) **Refresh/atualização de sessão não ocorrendo em rotas certas**
- O token expira e precisa ser renovado (Supabase faz isso via cookies). Se a atualização não roda quando deve, pode pedir login de novo.

## Plano de implementação
### 1) Acelerar o fluxo de login (alto impacto)
- Ajustar `middleware` para **não rodar updateSession** em rotas de auth e páginas públicas:
  - excluir `/auth/*` do matcher (principalmente `/auth/callback`).
  - manter updateSession apenas onde faz sentido: `/dashboard/*`, `/community/*` (se for protegido) e APIs que exigem auth.

### 2) Tornar `updateSession()` “lazy” (reduz latência geral)
- Em `updateSession(request)`, só chamar `supabase.auth.getUser()` se:
  - existir cookie do Supabase (nome começando com `sb-`), ou
  - a rota for protegida.
- Se não houver cookie de auth, retornar `NextResponse.next()` sem custo.

### 3) Garantir “lembrar login” em produção e dev
- Ajustar `getSupabaseCookieOptions()` para também definir `maxAge/expires` fora de produção (pelo menos 30 dias) — mantendo `secure=false` em dev.
- Garantir `SUPABASE_COOKIE_DOMAIN=.irontracks.com.br` (env) em prod para eliminar qualquer dúvida de domínio.
- Opcional: mover o redirect `www → apex` para a camada de edge (Vercel/Cloudflare), para não interferir no handshake do OAuth.

### 4) Melhorar percepção no LoginScreen (opcional)
- Remover o `setTimeout(2500)` e trocar por feedback “Redirecionando…” sem disparar erro falso durante o OAuth ([LoginScreen.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.js#L22-L35)).

## Arquivos que vou mexer
- [middleware.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/middleware.ts)
- [supabase/middleware.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/middleware.ts)
- [cookieOptions.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/cookieOptions.ts)
- (opcional UX) [LoginScreen.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.js)

## Validação
- Entrar com Google → voltar para `/dashboard` (tempo menor no callback).
- Fechar e reabrir o navegador: continuar logado (especialmente em dev após ajuste de cookie).
- `npm run lint` e `npm run build`.