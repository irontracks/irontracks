## Diagnóstico (por que ainda cai direto no app)
- O link de recovery do Supabase autentica o usuário antes de voltar pro seu site.
- Se o `redirect_to` voltar para `/` (home), o seu servidor detecta usuário logado e redireciona para `/dashboard` antes do React client conseguir “interceptar” e mandar para `/auth/recovery`.
- Portanto, para garantir a etapa de “DEFINIR NOVA SENHA”, o `redirect_to` do link precisa apontar direto para **`/auth/recovery`** (rota pública) e essa rota deve estar **liberada na allowlist** do Supabase.

## O que ajustar no Supabase (sim, precisa)
### 1) URL Configuration / Redirect URLs (allowlist)
- No Supabase Dashboard → Authentication → URL Configuration (ou Auth Settings):
  - Adicionar em **Additional Redirect URLs**:
    - `http://localhost:3000/auth/recovery`
    - `http://localhost:3000/auth/recovery?next=/dashboard`
    - `https://irontracks.com.br/auth/recovery`
    - `https://irontracks.com.br/auth/recovery?next=/dashboard`
  - (Opcional) também adicionar `/auth/callback` se você usa outros fluxos com code.

### 2) Template de “Recovery”
- No Supabase → Authentication → Emails → Templates → **Recovery**:
  - Garantir que o botão/link usa **`{{ .ConfirmationURL }}`**.
  - Evitar usar `{{ .SiteURL }}` ou link “montado na mão”, porque isso costuma fixar o redirect errado.

## Ajuste no app (reforço, já aplicável)
- Garantir que o request do “Esqueci a senha” manda:
  - `redirectTo: window.location.origin + '/auth/recovery?next=/dashboard'`
- Isso já está no código; o ponto crítico é o Supabase aceitar esse redirect (allowlist acima).

## Validação
1) Pedir um novo e-mail de recuperação (links antigos podem expirar / ser invalidados).
2) Conferir que o link do e-mail contém `redirect_to=http://localhost:3000/auth/recovery...`.
3) Ao clicar, deve abrir diretamente a tela **DEFINIR NOVA SENHA**.

Se você aprovar, eu também ajusto a tela /auth/error para detectar `otp_expired` no hash e orientar “gere um novo link”, mas o essencial é liberar o redirect e corrigir o template.