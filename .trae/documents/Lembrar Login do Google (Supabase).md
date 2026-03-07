## Diagnóstico
- Hoje o app usa Supabase com cookies (SSR) via [client.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/client.ts), [server.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/server.ts) e refresh no middleware ([middleware.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/middleware.ts)).
- O motivo de “ter que logar toda vez” é que em **development** o cookie não recebe `maxAge/expires` (vira cookie de sessão e some ao fechar o browser). Isso está explícito em [cookieOptions.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/supabase/cookieOptions.ts#L24-L35): só seta expiração em produção.

## Objetivo
- Fazer o login ser lembrado no desktop sem precisar refazer OAuth com Google a cada abertura.

## Mudanças propostas
1) **Persistir cookies também em development**
- Ajustar `getSupabaseCookieOptions()` para sempre definir `maxAge`/`expires` (ex.: 30 dias ou 365 dias), mesmo fora de produção.
- Manter `secure` como `false` em dev (necessário para localhost), e `sameSite: 'lax'`.
- Opcional: permitir configurar via env (`SUPABASE_COOKIE_MAX_AGE_DAYS`) para controlar a duração.

2) **Garantir que o callback do OAuth aplique as mesmas opções**
- Conferir que [auth/callback](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/callback/route.js) e [auth/login](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/login/route.ts) continuem usando `getSupabaseCookieOptions()` (já usam) — após o ajuste do item 1, a expiração será aplicada automaticamente.

3) **Validação objetiva**
- Rodar o app, logar uma vez e verificar no DevTools que os cookies `sb-*` estão com expiração futura.
- Fechar e reabrir o navegador e confirmar que `/dashboard` abre direto sem redirecionar para `/auth/login`.

## Observações importantes
- Isso não “burla” o Google; só garante que a sessão do Supabase não expire ao fechar o browser.
- Se o usuário estiver em modo anônimo ou com política de “limpar cookies ao fechar”, nenhum app consegue lembrar login.

Se você confirmar, eu aplico essas mudanças e valido abrindo o app duas vezes (antes/depois de fechar o browser).