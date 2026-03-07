Nenhuma Skill é necessária (é ajuste de auth/cookies + hardening de UI).

Pelo código atual, o app usa Supabase SSR via cookies. Dois problemas explicam exatamente os sintomas do PWA:

## Diagnóstico (por que desloga sempre)
- O cookie do Supabase só recebe `domain: .irontracks.com.br` quando **NODE_ENV=production** E **VERCEL_ENV=production**.
- Se você estiver em produção fora desse cenário (ou `VERCEL_ENV` diferente), o cookie vira **host-only**.
- No PWA, é comum instalar em um host (ex.: `www.irontracks.com.br`) e o middleware redireciona para `irontracks.com.br`. Se o cookie ficou preso ao host antigo, ao abrir pelo PWA ele chega “sem sessão” ⇒ pede login de novo.
- Fonte: [cookieOptions.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/supabase/cookieOptions.ts#L3-L16) + redirect www→apex [middleware.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/middleware.ts#L4-L13)

## Diagnóstico (tela preta ao voltar)
- Em modo standalone/PWA, erros JS sem overlay viram “tela preta”.
- Existe ponto frágil que pode causar crash caso props/sessão venham inconsistentes durante retomada/hidratação: spread de `initialUser` sem garantir objeto em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L945-L955).
- Também falta um “guard” de auth no client: se a sessão some ao retomar, o app não redireciona para login e pode ficar num estado quebrado.

## Plano
## 1) Garantir cookie de sessão compartilhado entre www/apex
- Atualizar `getSupabaseCookieOptions()` para:
  - Definir `domain: .irontracks.com.br` sempre que `NODE_ENV=production` **e** o `NEXT_PUBLIC_SITE_URL` (ou fallback) estiver em `irontracks.com.br`.
  - Adicionar override opcional via env `SUPABASE_COOKIE_DOMAIN` (para staging/white-label sem risco).
  - Manter `secure` e `sameSite` adequados.

Arquivos:
- `src/utils/supabase/cookieOptions.ts`

## 2) Retomar no PWA sem tela preta (hardening + fallback)
- Blindar `IronTracksAppClient` para nunca crashar se `initialUser` vier inesperado:
  - `const nextUser = { ...(initialUser || {}), ... }`
  - Se `!initialUser?.id`, mostrar tela de loading/login e/ou redirecionar.
- Adicionar listener `supabase.auth.onAuthStateChange` no client para:
  - Quando detectar `SIGNED_OUT`/session nula, limpar estado local (sem precisar limpar cache) e redirecionar para `/?next=/dashboard`.

Arquivos:
- `src/app/(app)/dashboard/IronTracksAppClient.js`

## 3) Ping de retomada com sinal de sessão
- Ajustar `/api/auth/ping` para retornar:
  - `204` quando existe sessão válida (refresh ok)
  - `401` quando não existe usuário
- No `layout.js`, ao retomar foco/visibilidade:
  - Se ping voltar `401`, forçar navegação para login (em vez de ficar numa tela quebrada).

Arquivos:
- `src/app/api/auth/ping/route.ts`
- `src/app/layout.js`

## Validação
- Fluxo PWA instalado em `www` e em `apex`: permanecer logado entre fechamentos/aberturas.
- Retomar app (background→foreground) várias vezes: sem tela preta; se sessão expirar, redireciona para login automaticamente.
- Rodar `npm run build`.

Se você confirmar, eu implemento os 3 blocos acima e valido com build + um checklist de teste em iOS/Android/PWA.