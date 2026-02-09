# Configurar SMTP no Supabase (Recuperação de Senha)

O fluxo de “Esqueci a senha” do IronTracks usa `resetPasswordForEmail(...)`. O limite de envio de e-mails pode acontecer se o projeto estiver usando o provedor padrão do Supabase.

Para remover essa dependência, configure um **SMTP próprio** no Supabase. Assim o envio passa a ser do seu provedor (SendGrid / Amazon SES / Mailgun etc.), com limites e entregabilidade controlados por você.

## Passo a passo (Dashboard)
1. Abra o projeto no Supabase Dashboard.
2. Vá em **Authentication → Settings**.
3. Procure a seção **SMTP** (em algumas versões do dashboard aparece como **Project Settings → Auth → SMTP**).
4. Preencha os campos do seu provedor:
   - Host
   - Port
   - Username
   - Password
   - Sender name / Sender email
5. Salve.
6. Se houver botão de “Send test email”, envie um teste e confirme recebimento.

## Dicas
- Use um domínio próprio (ex.: `no-reply@irontracks.com.br`) para melhorar entregabilidade.
- Configure SPF/DKIM/DMARC no DNS do domínio conforme o provedor (SendGrid/SES/Mailgun) recomenda.
- Mesmo com SMTP, mantenha cooldown no app para evitar abuso e custos desnecessários.

## Troubleshooting
- Se continuar dando “email rate limit exceeded”, confirme se o SMTP está realmente habilitado e ativo no painel do Supabase.
- Se aparecer “Error sending recovery email”:
  - Confirme que o domínio está verificado no provedor (ex.: no Resend precisa estar “Verified”, não “Pending”).
  - Confirme que o Sender email address (campo “De:”) é do mesmo domínio verificado (ex.: `no-reply@seu-dominio.com`).
  - Confirme credenciais SMTP (host/porta/usuário) e que a senha é a credencial correta (no Resend, a senha é a API Key `re_...`).
  - Troque a porta 465 ↔ 587 e teste novamente (alguns ambientes preferem STARTTLS).
- Verifique spam/junk e regras do provedor.

## Recovery: garantir tela de nova senha
Se ao clicar no link de recuperação o usuário entra direto no app (dashboard) em vez de abrir a tela de “DEFINIR NOVA SENHA”, normalmente o `redirect_to` do Supabase está voltando para `/` e o app redireciona usuários logados automaticamente.

Para corrigir:
1. Supabase Dashboard → Authentication → URL Configuration (ou Auth Settings).
2. Em **Additional Redirect URLs**, inclua (ajuste seus domínios):
   - `http://localhost:3000/auth/recovery`
   - `http://localhost:3000/auth/recovery?next=/dashboard`
   - `https://irontracks.com.br/auth/recovery`
   - `https://irontracks.com.br/auth/recovery?next=/dashboard`
3. Supabase Dashboard → Authentication → Emails → Templates → **Recovery**:
   - Confirme que o botão/link usa `{{ .ConfirmationURL }}` (evite montar link manual com `{{ .SiteURL }}`).
4. Gere um novo e-mail de recuperação e confira se o link contém `redirect_to=.../auth/recovery...`.

### Evitar erro de PKCE (recomendado)
Se você estiver vendo “PKCE code verifier not found in storage”, significa que o Supabase está redirecionando com `code=...` e o navegador que abriu o link não tem o code verifier (ex.: abriu em outro dispositivo, aba anônima, ou storage foi limpo).

A forma mais robusta é mudar o template de Recovery para apontar direto para o app usando `token_hash`, e o app faz `verifyOtp` sem depender de PKCE.

No Supabase → Authentication → Emails → Templates → **Reset password** (Recovery), substitua o link por algo assim:

`{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery`

Depois gere um novo e-mail e use o último link.
