## Por que está entrando direto no app
- O seu link de recuperação está caindo em `/auth/callback` (ou algo que termina em redirect para `/dashboard`).
- A rota [auth/callback/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/callback/route.ts) atualmente sempre faz `exchangeCodeForSession(code)` e redireciona para `next` (default `/dashboard`). Isso pula a etapa de definir senha.

## Solução
### 1) Ajuste no app (recomendado)
- Alterar [auth/callback/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/callback/route.ts) para detectar `type=recovery` (quando o Supabase redireciona) e, nesse caso:
  - **não** finalizar o fluxo indo para `/dashboard`
  - redirecionar para `/auth/recovery?code=...&next=...&type=recovery`
- Assim o usuário sempre cai na tela de “DEFINIR NOVA SENHA” que já existe em `/auth/recovery`.

### 2) Ajuste no Supabase (opcional, mas bom)
- No template de e-mail de Recovery, confirmar que o link usa a URL de confirmação padrão (ConfirmationURL) e que o `redirect_to` permitido inclui `/auth/recovery`.

## Validação
- Gerar novo recovery → clicar no link → cair em `/auth/recovery` → ver form de senha → salvar → redirecionar para `/dashboard`.
- Testar também link expirado (otp_expired) para confirmar mensagem correta.
