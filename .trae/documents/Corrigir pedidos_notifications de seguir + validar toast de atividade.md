Diagnóstico (pelo código atual):
- “Pedidos para seguir” na Comunidade vem de `social_follows` onde `following_id = você` e `status = pending`. Hoje isso só é carregado no *load inicial*; se alguém te segue enquanto a página está aberta, não atualiza (sem realtime/refresh).
- Notificações de follow (`follow_request`) são criadas só quando o INSERT em `social_follows` acontece. Se o usuário tentar seguir de novo e cair em “duplicate/unique”, o endpoint hoje responde `ok: true, already: true` e não reenvia a notificação.
- Toast de “atividade do seguido” (ex: `workout_start`) só chega quando o follow está `accepted`.

## Plano
1) **Fazer “Pedidos para seguir” atualizar sempre**
- Adicionar na Comunidade uma subscription Realtime em `social_follows` para:
  - `INSERT`/`UPDATE`/`DELETE` com `following_id = userId`
  - ao receber `pending`, adicionar na lista e buscar o perfil do follower
  - ao virar `accepted` ou ser deletado, remover da lista
- Adicionar um refresh automático ao voltar para a aba (eventos `visibilitychange/pageshow`) para garantir consistência.

2) **Garantir que seguir → notificação funcione sempre (inclusive reenviar)**
- Ajustar `/api/social/follow` para, em caso de duplicate:
  - buscar o registro existente em `social_follows`
  - se estiver `pending`, reenviar a notificação `follow_request` (apagando antes qualquer `follow_request` não-lida do mesmo remetente para o mesmo destinatário, para evitar spam)
  - se estiver `accepted`, apenas retornar `ok` com status `accepted`.
- Isso cobre o caso “mandou, cancelou, mandou novamente” e também “mandou novamente sem cancelar”.

3) **Validar card/toast flutuante de atividades do seguido**
- Confirmar que após `accepted` o `/api/social/workout-start` envia para seguidores aceitos e que o toast aparece.
- Fazer um teste end-to-end:
  - criar/garantir follow `accepted`
  - disparar `workout_start`
  - verificar que a notificação chega e o toast flutua por ~5s com avatar.

4) **Ajustes de UX na Comunidade**
- Quando estiver pendente (tanto enviado quanto recebido), mostrar estados/botões consistentes e mensagens de erro amigáveis.

Se aprovado, eu implemento as mudanças em `CommunityClient.tsx` e `src/app/api/social/follow/route.ts` e faço a validação completa.