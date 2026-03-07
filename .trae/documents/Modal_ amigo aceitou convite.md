## Objetivo
- Mostrar um **modal/janela** quando o seu amigo **aceitar o convite para treinar junto**.

## Como está hoje (contexto)
- Já existe modal para **receber convite**: [IncomingInviteModal.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/IncomingInviteModal.js).
- A aceitação do convite atualiza `invites.status` para `accepted` via RPC `accept_team_invite` (Supabase) e atualiza `team_sessions.participants`, mas **não existe notificação visual pro host**.

## Solução (sem depender de migrations)
### 1) Detectar aceitação do convite no client (host)
- No [TeamWorkoutContext.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/contexts/TeamWorkoutContext.js):
  - Adicionar um estado `acceptedInviteNotice` (ex.: `{ inviteId, user: { displayName, photoURL }, teamSessionId }`).
  - Criar um listener realtime para `invites`:
    - evento: `UPDATE`
    - filtro: `from_uid=eq.<user.id>`
    - quando `new.status === 'accepted'`:
      - buscar perfil do `to_uid` em `profiles`
      - setar `acceptedInviteNotice`
      - tocar som (`playStartSound`) opcional
  - Criar fallback por polling (ex.: a cada 20s) enquanto `teamSession.id` existir:
    - buscar `invites` com `team_session_id = teamSession.id` e `status='accepted'`
    - evitar repetição com `seenAcceptedInviteIds` (Set em ref/state)

### 2) Criar o novo modal
- Criar componente `InviteAcceptedModal` seguindo o estilo do modal existente:
  - Layout semelhante ao IncomingInviteModal (full-screen overlay, foco na mensagem).
  - Texto: “Fulano aceitou seu convite” / “Bora treinar junto!”
  - Botões:
    - “Ok” (fecha)
    - opcional: “Ver participantes” (fecha e mantém no treino; só UX)

### 3) Plugar o modal no app
- Em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js):
  - Renderizar `InviteAcceptedModal` junto do `IncomingInviteModal`.
  - Passar handlers para fechar/limpar `acceptedInviteNotice`.

## Validação
- Cenário 1: host envia convite, amigo aceita → modal aparece no host.
- Cenário 2: realtime falha → polling detecta aceitação e mostra modal.
- Garantir que o modal aparece **uma vez por inviteId**.

Se aprovar, eu implemento exatamente isso (context + modal + integração).