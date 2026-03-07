Nenhuma Skill é necessária.

## Diagnóstico provável
O “tela preta” sumiu (ótimo), mas o PWA pedir login sempre ao reabrir indica que a **sessão em cookie não está persistindo após encerrar o WebView/Safari**.

O app usa Supabase SSR via cookies (não localStorage). Se esses cookies estiverem sendo criados como **session cookies (sem Expires/Max-Age efetivo)**, o iOS pode limpá-los quando você fecha o PWA/Safari, causando exatamente esse comportamento.

O fluxo de login/callback seta cookies via `createServerClient(..., { cookieOptions: getSupabaseCookieOptions() })` em:
- [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts)
- [auth/callback/route.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/callback/route.js)
E `getSupabaseCookieOptions()` hoje não define `expires/maxAge` explicitamente:
- [cookieOptions.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/supabase/cookieOptions.ts)

Mesmo que o `@supabase/ssr` costume setar expiração, na prática (especialmente com iOS/PWA) é mais seguro **forçar cookies persistentes**.

## Plano
## 1) Tornar cookies do Supabase explicitamente persistentes em produção
- Atualizar `getSupabaseCookieOptions()` para incluir:
  - `expires: new Date(Date.now() + 1000*60*60*24*365)` (1 ano)
  - `maxAge: 60*60*24*365` (1 ano, em segundos) *se compatível com o tipo/Next cookies*.
- Manter o override `SUPABASE_COOKIE_DOMAIN` e o cálculo de domínio por `NEXT_PUBLIC_SITE_URL`.

## 2) Evitar regressão no OAuth
- Garantir que `sameSite` continue `lax` (necessário para o redirect do Google funcionar bem em navegação top-level).

## 3) Validação
- Rodar `npm run build`.
- Em dev, não dá para reproduzir 100% o iOS, mas a validação principal é:
  - Em produção/iOS: logar 1 vez, fechar o PWA completamente, reabrir e confirmar que o cookie continua válido (não pede login).

Se aprovado, eu aplico a mudança em `src/utils/supabase/cookieOptions.ts` e rodo o build.