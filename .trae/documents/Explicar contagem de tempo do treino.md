## Diagnóstico
- Hoje o login é persistido via **cookies do Supabase** (porque `createBrowserClient`/`createServerClient` do `@supabase/ssr` usam cookies por padrão). Isso já deveria sobreviver a “bloquear tela/fechar app”.
- Os casos mais comuns de “deslogar sozinho” em smartphone aqui no seu código são:
  - Cookies não ficando estáveis entre variações de host/ambiente (ex.: `www` ↔ sem `www`) e/ou políticas agressivas de cookies em iOS/in-app browsers.
  - Logout atual usando `scope: 'global'` (se o usuário sair em outro dispositivo, derruba todos).
  - A rota `/auth/login` cria o client SSR com `getAll()` retornando `[]`, o que pode atrapalhar consistência de cookies em fluxos repetidos de OAuth/PKCE.

## O que vou mudar (para ficar “sempre logado”)
### 1) Padronizar cookies do Supabase (domínio/segurança)
- Criar uma configuração única de `cookieOptions` e aplicá-la em todos os lugares que criam Supabase client:
  - `domain: '.irontracks.com.br'` em produção (sem domain em dev)
  - `path: '/'`
  - `sameSite: 'lax'`
  - `secure: true` em produção
- Aplicar em:
  - [client.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/client.ts)
  - [server.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/server.ts)
  - [middleware.ts (supabase)](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/middleware.ts)
  - rotas de auth (login/callback/logout)

### 2) Evitar logout “em todos os dispositivos” por padrão
- Trocar `supabase.auth.signOut({ scope: 'global' })` por `scope: 'local'` em [logout/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/logout/route.ts).
- (Opcional) depois eu adiciono um botão separado “Sair de todos os dispositivos”.

### 3) Consertar cookies no início do OAuth
- Ajustar [login/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/login/route.ts) para `getAll()` retornar os cookies reais do request (em vez de `[]`).

## Validação
- Testar login no desktop e:
  - fechar aba, reabrir → continua logado
  - bloquear/desbloquear (simulado) → continua logado
  - acessar via `www` e sem `www` → continua logado
- Testar que logout derruba **só o dispositivo atual**.

Se você confirmar, eu aplico essas mudanças agora e deixo pronto para subir.