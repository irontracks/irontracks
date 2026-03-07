## Diagnóstico (provável causa)
- O botão em [LoginScreen.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/LoginScreen.js) depende de `onClick` (hidratação do React). Se a hidratação falhar por qualquer motivo (bundle stale, erro JS no load, etc.), o botão aparece mas fica “morto”.

## Correção (mais robusta, não depende de JS)
### 1) Transformar o botão em fallback navegável
- Trocar o `<button onClick={handleLogin}>` por um `<a>` estilizado (ou `<button>` dentro de um `<form action="/auth/login" method="GET">`).
- Garantir `href` default sempre funcional: `/auth/login?next=%2Fdashboard`.
- Manter JS apenas para melhorar o `next` quando existir `?next=...` na URL.

Resultado: mesmo que o React não hidrate, o login com Google continua funcionando via navegação nativa.

### 2) Blindar UX de “cliquei e nada aconteceu”
- No handler (quando JS estiver ativo), usar `window.location.assign(...)` e adicionar um timeout curto (ex.: 2s) para reabilitar o botão e mostrar mensagem caso o redirect não ocorra.

### 3) Validação
- Abrir `/` e testar:
  - clique com JS normal → redireciona para `/auth/login` e depois Google.
  - simular falha de JS (desativar JS no devtools) → link ainda leva para `/auth/login`.
- Conferir se `/auth/login` continua retornando redirect correto (já está implementado em [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts)).

Se aprovado, eu implemento a troca no `LoginScreen` e faço o teste no dev server.