Você está certo em cobrar isso.

**1) Sobre “parar de seguir” e notificações**
- Hoje, quando você clica **Parar de seguir**, o app apenas **apaga o registro** em `social_follows` (não existe nenhuma notificação de “fulano parou de te seguir”).
- E a pessoa que você deixou de seguir **não vai mais receber nada seu** porque todos os disparos (online/treino) consultam apenas seguidores com `status='accepted'`. Sem a linha em `social_follows`, não entra no envio.
- Única exceção possível é “histórico”: se já existiam notificações antigas no menu, elas continuam lá (isso é histórico local do inbox). Se você quiser, eu também posso limpar automaticamente notificações relacionadas ao usuário ao dar unfollow.

**2) Onde fica o lugar de seguir pessoas**
- A tela já existe em **`/community`** (rota nova). Por enquanto, ela não está linkada em nenhum botão/menu do dashboard.

## O que vou fazer agora (se você confirmar)
1. **Adicionar item “Comunidade” no menu do avatar (HeaderActionsMenu)**
   - Um botão “Comunidade” que faz `router.push('/community')`.
2. **(Opcional, mas recomendo) Limpar notificações do usuário ao dar “Parar de seguir”**
   - No unfollow, além de deletar `social_follows`, deletar ou marcar como lidas as notificações em `notifications` onde `sender_id = usuário` e `user_id = você`.

## Validação
- Conferir se o menu abre a tela `/community`.
- Testar unfollow e garantir que eventos novos (online/treino) não geram mais notificações.
