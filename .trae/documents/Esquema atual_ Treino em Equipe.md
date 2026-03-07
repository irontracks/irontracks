## Visão geral (o que é “treino em equipe” hoje)
- É um fluxo de **convite + sessão compartilhada** em tempo real.
- Um usuário (host) convida outro (convidado) durante o treino ativo.
- Ao aceitar, ambos passam a estar vinculados a um **team_session** (com participantes) e o app mantém tudo via **Supabase Realtime + fallback**.

## Peças principais (frontend)
- **Contexto/Provider (núcleo)**: mantém estado e ações do recurso.
  - [TeamWorkoutContext.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/contexts/TeamWorkoutContext.js)
  - Estado: `incomingInvites`, `acceptedInviteNotice`, `teamSession`.
  - Ações: `sendInvite`, `acceptInvite`, `rejectInvite`, `leaveSession`.
- **Onde é montado**: no app do dashboard, o `TeamWorkoutProvider` envolve a aplicação e habilita os modais globais.
  - [IronTracksAppClient 3.js:L2617-L2631](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js#L2617-L2631)
- **UI de convites**:
  - Envio (dentro do treino ativo): [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)
  - Seleção de pessoa para convidar: [InviteManager.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/InviteManager.js)
  - Modal de convite recebido: [IncomingInviteModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/IncomingInviteModal.js)
  - Modal “convite aceito” para o host: [InviteAcceptedModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/InviteAcceptedModal.js)

## Fluxo end-to-end (host → convidado)
### 1) Host envia convite
- No treino ativo, o host abre o `InviteManager` e escolhe alguém.
- O `sendInvite()` (no Context) faz:
  - cria `team_sessions` se não existir
  - insere um registro em `invites` com `from_uid`, `to_uid`, `workout_data` e `team_session_id`
- Isso é feito **direto pelo client via Supabase** (sem rota API própria).

### 2) Convidado recebe
- O Provider do convidado assina Realtime em `invites` filtrando `to_uid`.
- Também existe **fallback** (polling/visibility/focus) se realtime falhar.

### 3) Convidado aceita
- `acceptInvite()` chama **RPC transacional**: `accept_team_invite(invite_id)`.
- Essa função:
  - trava o convite (`FOR UPDATE`)
  - valida que o usuário é o `to_uid`
  - adiciona o participante na `team_sessions.participants` (jsonb)
  - marca `invites.status = accepted`
  - retorna `{ team_session_id, participants, workout }`
- Migração (RPC + RLS):
  - [20260102150000_harden_team_sessions_invites_rls.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260102150000_harden_team_sessions_invites_rls.sql)

### 4) Host recebe aviso do aceite
- O Provider do host escuta updates em `invites` filtrando `from_uid`.
- Quando status vira `accepted`, ele carrega o perfil do convidado e mostra o `InviteAcceptedModal`.

## Backend/API (o que existe em /api)
- Só existe **um endpoint de time**:
  - `GET /api/team/invite-candidates`: lista candidatos (alunos do professor + perfis recentes por search).
  - [invite-candidates/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/team/invite-candidates/route.ts)
- Envio/aceite/rejeição de convite é via **Supabase client** + **RPC**.

## Supabase (tabelas, realtime, políticas)
- Tabelas principais:
  - `team_sessions` (participants jsonb, workout_state jsonb, status, host_uid)
  - `invites` (from_uid/to_uid, status, workout_data, team_session_id)
- Realtime publicado para `invites`, `team_sessions`, `notifications`:
  - [20240102_fix_realtime_invites.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20240102_fix_realtime_invites.sql)
- Triggers:
  - Ao criar invite, gera notificação em `notifications`.
  - Atualiza `updated_at` em `team_sessions`.
  - [20260102173000_team_sessions_state_and_invite_notifications.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/20260102173000_team_sessions_state_and_invite_notifications.sql)

## Observações importantes do “estado atual”
- **leaveSession hoje só zera o estado local** (há comentário indicando que o ideal seria remover o participante no DB também).
- A “sessão em equipe” existe em DB, mas o uso principal hoje é:
  - convite/aceite em tempo real
  - sincronização dos participantes via updates em `team_sessions`

## Se você quiser evoluir (opcional)
- Implementar `leaveSession` no banco (remover participante e/ou finalizar sessão).
- Persistir/propagar `workout_state` de forma explícita para compartilhar o progresso do treino em tempo real.

(Esse documento descreve fielmente como está hoje; nenhuma mudança de código.)