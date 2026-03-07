## O que esse erro significa
- O Supabase conseguiu processar o pedido de recovery, mas **falhou ao enviar o e-mail via SMTP** (Resend). Isso é 100% do lado “configuração de envio”.

## Causas mais comuns (Resend)
1. **Domínio ainda não está 100% verificado no Resend**
   - Se o domínio estiver “pending” (SPF/DKIM ainda propagando), o Resend pode recusar o envio e o Supabase só mostra o erro genérico.
2. **Sender email address não é do domínio verificado**
   - No Supabase, o “Sender email address” precisa ser algo como `no-reply@SEU_DOMINIO` (mesmo domínio que você verificou no Resend).
3. **Senha SMTP errada**
   - No Resend, a “senha do SMTP” é a **API Key** (`re_...`). Usuário SMTP é sempre `resend` e host `smtp.resend.com`.
4. **Porta/TLS incompatível**
   - Se 465 estiver dando problema, 587 (STARTTLS) costuma funcionar melhor em alguns ambientes.

## Checklist (faça na ordem)
1. **Resend → Domains**
   - Confirme que o seu domínio está como **Verified**.
2. **Supabase → Authentication → Emails → SMTP Settings**
   - Enable custom SMTP: ON
   - Sender email address: `no-reply@seu-dominio.com` (do domínio verificado)
   - Sender name: `IronTracks`
   - Host: `smtp.resend.com`
   - Username: `resend`
   - Password: `re_...` (API key do Resend)
   - Port: tente **465**; se falhar, troque para **587** e salve novamente.
3. **Enviar e-mail teste**
   - Se o painel do Supabase tiver “Send test email”, use.
4. **Checar logs no Resend**
   - Veja se aparece tentativa de envio e qual o motivo (bounced/blocked/unauthorized sender).

## Onde confirmar a regra (docs oficiais)
- Resend SMTP: host/port/username/password (API key). https://resend.com/docs/send-with-smtp
- Supabase custom SMTP e restrições do SMTP padrão. https://supabase.com/docs/guides/auth/auth-smtp

## Resultado esperado
- O botão “Esqueci a senha” volta a enviar o e-mail normalmente.

Se você colar aqui **apenas** estes 3 itens (sem expor a API key):
- seu **Sender email address** (mascarando, ex.: `no-reply@irontracks...`)
- a **porta** que você colocou (465 ou 587)
- o **status do domínio** no Resend (Verified ou Pending)
eu te digo exatamente qual dos 4 pontos acima é o causador.