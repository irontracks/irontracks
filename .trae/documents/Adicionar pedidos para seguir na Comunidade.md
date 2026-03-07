Hoje a tela de Comunidade só lista pessoas para você seguir e só carrega seus follows como **follower_id = você** (ou seja, seus pedidos enviados). Para ter um lugar fixo para aceitar solicitações mesmo se a notificação for apagada, precisamos também listar os follows pendentes onde **following_id = você**.

## O que vou implementar
## 1) Carregar solicitações pendentes recebidas
- Em [CommunityClient.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/community/CommunityClient.tsx), além do fetch atual:
  - manter `social_follows` do tipo “enviados” (follower_id = uid) para marcar botões “Solicitado/Parar de seguir”.
  - adicionar um novo fetch para “recebidos”: `social_follows` com `following_id = uid` e `status = 'pending'`.
- Buscar os perfis dos followers (display_name/photo_url/role) em uma segunda query `profiles.in('id', followerIds)` para não depender de embed por FK.

## 2) Criar um bloco fixo “Pedidos para seguir” na Comunidade
- No topo da Comunidade (abaixo do header/busca), renderizar um card:
  - título: “Pedidos para seguir”
  - contador de pendentes
  - lista com avatar + nome + role
  - botões: **Aceitar** e **Negar**
  - estado vazio: “Nenhuma solicitação pendente.”

## 3) Aceitar/Negar funcionando mesmo sem notificação
- Reusar o endpoint existente [/api/social/follow/respond](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/follow/respond/route.ts) via `fetch`:
  - accept: `{ follower_id, decision: 'accept' }`
  - deny: `{ follower_id, decision: 'deny' }`
- Após sucesso, remover o pedido da lista local e opcionalmente atualizar o mapa de follows (se fizer sentido para UI).

## 4) Resiliência e UX
- Adicionar loading/busy por request para não clicar duas vezes.
- Reaproveitar a mesma lógica de mensagens amigáveis de erro (quando ocorrer problema de schema/migrations).

## 5) Validação
- Testar o fluxo criando um `social_follows` pendente (A segue B) e confirmar que em B:
  - aparece no card “Pedidos para seguir”
  - Aceitar muda status para accepted e some da lista
  - Negar remove a linha e some da lista
  - não depende da notificação existir.

Se confirmado, eu aplico as alterações em `CommunityClient.tsx` e valido no /community.