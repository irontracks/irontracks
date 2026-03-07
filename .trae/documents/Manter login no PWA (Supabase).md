## Causa raiz (pelo código atual)
- O app depende do refresh de sessão via middleware (`updateSession` chama `supabase.auth.getUser()` e regrava cookies).
- Só que o middleware hoje roda apenas em `['/', '/dashboard/:path*', '/auth/:path*']` em [middleware.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/middleware.ts#L16-L18).
- Quando você volta do background e reabre em outra rota (ex.: marketplace/assessments/nutrition etc.), o refresh não acontece e o server entende como sessão expirada → pede login de novo.

## 1) Ampliar o matcher do middleware (principal correção)
- Alterar o `config.matcher` para cobrir praticamente todas as rotas do app, excluindo apenas assets estáticos do Next:
  - excluir `_next/static`, `_next/image`, `favicon.ico`, `manifest.json`, `icone.png`, `robots.txt`, `sitemap.xml`.
- Objetivo: qualquer navegação/retorno ao PWA passa pelo middleware e renova os cookies de sessão automaticamente.

## 2) Garantir “refresh no foco” (melhoria extra, sem UI)
- Adicionar um listener client-side (em um ponto global, ex.: layout/app shell) que, ao voltar para foreground (`visibilitychange`/`focus`), faça uma chamada leve para uma rota protegida (ex.: `/api/ping-auth`) só para forçar refresh/validação.
- Essa rota pode simplesmente chamar `supabase.auth.getUser()` server-side e retornar 204.

## 3) Verificação (reproduzir e provar que resolveu)
- Rodar no iPhone/PWA: logar → colocar app em background por alguns minutos → voltar.
- Confirmar que não redireciona para login e que os cookies `sb-*` são renovados.

## 4) Segurança e comportamento de logout
- Manter o logout apenas via `/auth/logout` (como já existe) e não mexer em layout.

Se você aprovar, eu faço as mudanças no `middleware.ts`, adiciono o ping-auth (opcional) e valido no PWA.