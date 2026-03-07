## Objetivo
- Usar `http://localhost:3000` no dev mantendo o Site URL do Supabase em `https://irontracks.com.br`.

## O que fazer no Supabase (sem mudar o Site URL)
1) Em **Authentication → URL Configuration**
- Manter **Site URL** = `https://irontracks.com.br`
- Em **Redirect URLs / Additional Redirect URLs**, adicionar:
  - `http://localhost:3000/*`
  - (ou pelo menos) `http://localhost:3000/auth/callback`

2) Em **Authentication → Providers (Google/Apple/etc)**
- Se você usa OAuth externo, adicionar também o callback/local permitido no provedor:
  - No provedor (ex.: Google Cloud Console), incluir `http://localhost:3000/auth/callback` nos Authorized redirect URIs
  - Garantir que o Supabase Provider esteja configurado para aceitar o fluxo local (normalmente basta o redirect URL estar na allowlist do Supabase + provedor)

## O que fazer no app (para não depender do Site URL)
- Em dev, garantir que o app sempre use `redirectTo: 'http://localhost:3000/auth/callback'` (ou relativo quando possível) e que o `.env.local` esteja apontando para o mesmo projeto Supabase.

## Checklist rápido de validação
- Login via email magic link/OTP: o link deve retornar para `http://localhost:3000/auth/callback`.
- Login via OAuth: o provedor deve aceitar o callback local (senão dá erro no provider).

Se você confirmar, eu posso checar no código onde o `redirectTo` é montado e te dizer exatamente quais rotas precisam estar na allowlist.