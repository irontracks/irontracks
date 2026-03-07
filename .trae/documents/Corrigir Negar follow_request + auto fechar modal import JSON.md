Você trouxe 2 problemas:

1) **Botão “Negar” sem efeito**
- Pelo fluxo atual, existe um caso em que o clique fica “silencioso”: quando a notificação `follow_request` não tem `sender_id` nem `metadata.follower_id`. O handler retorna cedo e não chama o endpoint.
- Mesmo quando chama o endpoint, a UI só marca como lida no state; dependendo do shape/ID, pode não refletir e parecer que “não fez nada”.

2) **Modal “Importar JSON” não fecha ao selecionar arquivo**
- Hoje o modal só fecha no fim do fluxo e apenas em um caminho específico (após confirmação + import + alert). Se cancelar ou der erro, ele fica aberto.
- Também falta reset do input, então selecionar o mesmo arquivo de novo pode nem disparar `onChange`.

## Plano
## A) “Negar” funcionar sempre (com UX clara)
1. Ajustar `NotificationCenter.js` para:
   - Extrair `notificationId` de forma robusta (`item.id` e/ou `item.data.id`).
   - Extrair `followerId` com fallbacks (`item.data.sender_id`, `item.data.metadata.follower_id`, `item.sender_id`, `item.metadata.follower_id`).
   - Se ainda não tiver `followerId`, não retornar silencioso: enviar o `notification_id` para o backend para pelo menos marcar como lida e remover do menu.
   - Após sucesso, remover o item da lista (ou marcar lida usando `notificationId`), para ficar “visível” que negou.

2. Ajustar `/api/social/follow/respond` para aceitar opcionalmente `notification_id`:
   - Se `follower_id` vier ausente mas `notification_id` vier presente, ler a row de `notifications` do usuário autenticado e tentar inferir `follower_id` (`sender_id` ou `metadata.follower_id`).
   - Mesmo se não conseguir inferir, marcar a notificação como lida pelo `id` (assim o botão sempre tem efeito).

## B) Modal Importar JSON fechar automaticamente ao escolher arquivo
1. No `IronTracksAppClient.js`, no handler do `<input type="file">`:
   - Fechar o modal imediatamente no `onChange` (ao selecionar o arquivo).
   - Ler o arquivo e processar normalmente em background.
   - Se o usuário cancelar o confirm, apenas não importa (modal não reabre).
   - Em qualquer caso (sucesso/erro/cancel), garantir que o input seja resetado (`e.target.value = ''`) para permitir escolher o mesmo arquivo de novo.

## Validação
- Cenário follow_request: clicar “Negar” → notificação some do menu e o follow pending é removido quando possível.
- Cenário follow_request legado (sem sender_id/metadata): clicar “Negar” → pelo menos some do menu (sem ficar “sem efeito”).
- Cenário importar JSON: selecionar arquivo → modal fecha automaticamente; se importar com sucesso, lista atualiza; se erro/cancel, não trava modal.

Arquivos que vou alterar:
- `src/components/NotificationCenter.js`
- `src/app/api/social/follow/respond/route.ts`
- `src/app/(app)/dashboard/IronTracksAppClient.js`

Se você confirmar, eu implemento e valido com build + teste manual no dev.