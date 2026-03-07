## Diagnóstico (estado atual)
- O login por email/senha já é client-side em [LoginScreen.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.tsx), via `supabase.auth.signInWithPassword`.
- O problema é que após sucesso ele faz navegação hard (`window.location.href = '/dashboard'`), que força um round-trip SSR e pode acionar redirects/handlers no meio do caminho (pior em PWA iOS).
- O handler [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/login/route.ts) é OAuth-only (GET). Não existe handler para email/senha hoje.
- O callback OAuth [auth/callback/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/callback/route.ts) finaliza com `NextResponse.redirect(...)` (redirect server-side).
- As meta tags PWA iOS já estão no metadata do [layout.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/layout.tsx) (`appleWebApp.capable`, etc.).

## Mudança 1 — Login email/senha 100% SPA (sem hard navigation)
- Atualizar [LoginScreen.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.tsx) para:
  - usar `useRouter()` do `next/navigation`.
  - após `signInWithPassword`, trocar `window.location.href = '/dashboard'` por `router.replace('/dashboard')`.
  - opcionalmente (recomendado) chamar `router.refresh()` após o login para forçar re-hidratação SSR com cookies atualizados.
  - aplicar o mesmo padrão para os outros fluxos que hoje usam `window.location.href` (`/wait-approval`, recovery-code -> `/dashboard`).
- Motivo: evita reload/redirects HTTP e mantém a navegação no contexto standalone.

## Mudança 2 — Blindar /auth/login/route.ts para não virar “login email/senha”
- Manter o GET apenas para OAuth.
- Adicionar `export async function POST(...)` retornando 400 JSON com mensagem do tipo `use_client_side_login`.
- Objetivo: impedir que algum código legado volte a fazer POST server-side e reintroduza o bug.

## Mudança 3 — OAuth callback sem redirect HTTP (PWA-safe)
- Alterar [auth/callback/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/callback/route.ts) para, após `exchangeCodeForSession(code)`:
  - em vez de `NextResponse.redirect(redirectUrl)`, retornar **200 HTML** com:
    - `window.location.replace(safeNext)` (não cria entry no histórico)
    - fallback com `<meta http-equiv="refresh" ...>` e um link clicável.
  - continuar aplicando os cookies no mesmo `response` (como já faz via `setAll`).
- Motivo: remove o redirect server-side do caminho (que o iOS pode tratar como saída do contexto da PWA).

## Mudança 4 — Detecção de standalone para debug
- Criar [platform.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/platform.ts) com `isPwaStandalone()`.
- Logar no fluxo de login (somente em dev ou atrás de flag) o modo standalone e o caminho de navegação pós-login.

## Validação (obrigatória)
- Web (local): testar login email/senha e OAuth confirmando que o app navega para `/dashboard` sem reload hard.
- iOS PWA:
  - instalar na Home Screen
  - abrir via ícone
  - login email/senha: deve ir ao dashboard sem “pular” para Safari
  - OAuth: concluir e voltar ao dashboard dentro da PWA
  - fechar e reabrir: deve permanecer logado.

## Arquivos que serão alterados/criados
- Alterar: [LoginScreen.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/LoginScreen.tsx)
- Alterar: [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/login/route.ts)
- Alterar: [auth/callback/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/auth/callback/route.ts)
- Criar: `src/utils/platform.ts`

Se você confirmar, eu implemento exatamente esse pacote de mudanças e rodo `lint/tsc/build` aqui antes de você testar no iPhone.