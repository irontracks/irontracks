## Diagnóstico
- Você não está errado: no fluxo de recuperação, o link do e-mail autentica o usuário e o app precisa mostrar uma tela para definir a nova senha.
- Hoje o IronTracks troca o código e redireciona direto, então o usuário entra sem ver o formulário.
- Além disso, `next=/dashboard/settings` não parece existir como rota; “Settings” é um modal dentro de `/dashboard` ([SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js#L771-L806)).

## Implementação
1. Ajustar a página [auth/recovery/page.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/recovery/page.tsx) para:
   - Trocar o `code` por sessão (`exchangeCodeForSession`) como já faz.
   - Em vez de redirecionar imediatamente, exibir um formulário:
     - “Nova senha” + “Confirmar senha”
     - Validação (mínimo 6 caracteres e igualdade)
     - Botão “Salvar senha”
   - Ao salvar: `supabase.auth.updateUser({ password })` (mesmo padrão já usado no modal de segurança).
   - Após sucesso: redirecionar para `next` (default `/dashboard`).
   - Se o link não for `type=recovery`, apenas redirecionar para `next` (mantém compatibilidade com outros links).

2. Ajustar o redirect do “Esqueci a senha” em [LoginScreen.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/LoginScreen.js#L91-L99) para usar:
   - `redirectTo: <origin>/auth/recovery?next=/dashboard`
   - (opcional) `next=/dashboard?openSettings=1` e abrir automaticamente o SettingsModal no dashboard.

3. (Opcional, recomendável) Melhorar o “Definir / Alterar Senha” do modal de segurança:
   - Trocar o `window.prompt` por um mini-form dentro do modal (mesmo visual do app), reaproveitando a mesma validação.

## Validação
- Fluxo: clicar “Esqueci a senha” → receber e-mail → abrir link → ver tela “Definir nova senha” → salvar → entrar no `/dashboard`.
- Testar também:
  - senha curta
  - confirmação diferente
  - link expirado
  - reabrir link em outro navegador (mensagem clara)

Se você confirmar, eu implemento a tela de senha dentro do `/auth/recovery` e ajusto o redirect para cair nela em vez de entrar direto no app.