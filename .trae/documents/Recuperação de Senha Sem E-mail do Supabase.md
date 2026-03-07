## Resposta direta
- Login com senha já funciona sem e-mail: o e-mail do Supabase só entra no jogo quando a pessoa **esquece** a senha.
- Se você quer “recuperar senha sem e-mail do Supabase”, você precisa trocar o **canal de recuperação** (ou trocar o provedor de e-mail).

## Opções viáveis (com trade-offs)
1) **SMTP próprio (recomendado)**
- Continua sendo por e-mail, mas o envio deixa de depender do provedor padrão do Supabase (e do limitador dele).
- Você ganha controle de volume/entregabilidade via SendGrid/SES/Mailgun etc.
- Menor mudança no produto.

2) **Recuperação sem e-mail (backup codes)**
- Na criação da conta (ou na primeira vez logado), você gera 6–10 “códigos de recuperação” e pede para o usuário salvar.
- Se ele esquecer a senha, ele usa um código para entrar no fluxo de “definir nova senha” sem e-mail.
- Prós: não depende de e-mail/SMS. Contras: usuário precisa ter guardado o código.

3) **Reset por admin/suporte (sem e-mail)**
- Usuário abre um pedido (ex.: WhatsApp / formulário in-app). Admin valida identidade e define uma senha temporária.
- O app já tem infraestrutura de Admin com service role ([admin-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/admin-actions.js#L64-L75)), então dá para criar uma ação “resetar senha do usuário”.
- Prós: não depende de e-mail. Contras: exige operação/suporte e cuidado de segurança.

4) **Recuperação por SMS/WhatsApp OTP**
- Também foge do e-mail do Supabase, mas entra em outro limitador (do provedor de SMS/WhatsApp) e tem custo.

## Recomendação para IronTracks
- Curto prazo: **SMTP próprio** (resolve o limitador do Supabase e melhora entregabilidade).
- Médio prazo: adicionar **backup codes** para clientes “premium” e reduzir dependência de qualquer provedor.
- Alternativa operacional: **reset via admin** para casos críticos.

## Plano de implementação (se você aprovar)
1. Configurar SMTP no Supabase e validar envio (sem alterar lógica do app).
2. Implementar “Backup Codes”:
   - Tabela para códigos (hash + status + created_at + used_at).
   - UI em Settings para gerar/rotacionar e instruir o usuário a salvar.
   - Tela “Recuperar com código” no login que, ao validar, permite definir nova senha.
3. Implementar “Reset por Admin”:
   - Server action segura para admin setar senha temporária.
   - UI no painel admin para buscar usuário e resetar senha.
4. Validação end-to-end e testes (fluxo de esqueci senha sem e-mail e com backup code).

Se você aprovar, eu começo pela opção SMTP (mais rápida) e depois implemento Backup Codes + Reset Admin.