Incluo isso sim — e é requisito chave para evitar spam: **todas as notificações sociais e de treino terão toggle por usuário** (e o backend respeita isso antes de inserir notificações).

## 0) Base já existente
- Já existe `user_settings` no Supabase e o app já lê/salva preferências via [useUserSettings.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/hooks/useUserSettings.js) e UI em [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js).
- Já existem notificações e realtime no app (sino/toast). Vamos reaproveitar.

## 1) Banco de Dados (Migrations SQL)
1. **Criar `social_follows`**
   - `follower_id`, `following_id` (FK `public.profiles(id)`)
   - `status` ('pending'|'accepted')
   - `created_at`
   - Constraints: `follower_id != following_id`, `UNIQUE(follower_id, following_id)`
   - Indexes + RLS (insert follower, update following, select ambos, delete ambos)

2. **Evoluir `public.notifications` (compatível com o app atual)**
   - Adicionar `recipient_id`, `sender_id`, `metadata`, `is_read`
   - Manter `user_id/title/message/type/read` para não quebrar `NotificationCenter`.
   - Tipos novos (em `type`):
     - `follow_request`, `follow_accepted`
     - `friend_online`
     - `workout_start`, `workout_finish`, `workout_create`, `workout_edit`

3. **Realtime publication**
   - Garantir `social_follows` e `notifications` na `supabase_realtime`.

## 2) Preferências (Notificações Configuráveis)
1. **Adicionar flags no `user_settings.preferences` (frontend defaults + UI)**
   - `notifySocialFollows` (follow_request/follow_accepted)
   - `notifyFriendOnline` (friend_online)
   - `notifyFriendWorkoutEvents` (workout_* do amigo)
   - (Opcional) granular: separar start/finish/create/edit

2. **Backend respeita preferências**
   - Antes de inserir notificação para cada recipient, ler `user_settings.preferences` (via admin client server-side) e pular inserção se estiver desativado.

## 3) Backend (Gatilhos/Server Actions)
1. **Follow request**
   - Ao criar `social_follows(pending)`:
     - notifica o seguido **apenas se** `notifySocialFollows=true`
     - se usuário estiver online: toast + modal via realtime
2. **Aceitar/Negar**
   - Aceitar: update status + notifica quem pediu (se `notifySocialFollows=true`)
   - Negar: remove request + marca notificação como lida
3. **Entrar no app (online)**
   - Criar endpoint/action “presence ping” chamado 1x por sessão
   - Notifica seguidores aceitos com `friend_online` **somente se** `notifyFriendOnline=true` e com throttle (anti-spam)
4. **Treino (start/finish/create/edit)**
   - Integrar nos endpoints existentes do treino
   - Notificar seguidores aceitos **somente se** `notifyFriendWorkoutEvents=true`

## 4) Frontend
1. **/community**
   - Lista todos os `profiles` (alunos + professores) com busca
   - Botão: Seguir / Solicitado / Seguindo (hover Parar de seguir)
2. **Notificações (sino + lista)**
   - Reusar o NotificationCenter atual e adicionar suporte aos novos tipos
   - `follow_request`: Aceitar/Negar dentro do menu
   - Ao aceitar/negar: marcar como lida
3. **Toasts e Modal obrigatório**
   - Toast no canto superior direito já existe; só plugar novos tipos
   - Modal abre:
     - imediatamente via realtime quando online
     - ao entrar no app, se houver `follow_request` não lida

## 5) Ideias extras (melhorias)
- “Conta privada” (sempre pending) vs “pública” (auto-accept)
- Mute por usuário
- Rate limit e anti-spam
- Auto-accept opcional para relação coach↔aluno

## 6) Rodar SQL via CLI
- Criar migrations em `supabase/migrations` e aplicar via Supabase CLI (ex.: `supabase db push`).

Se aprovar, eu começo por: **migrations SQL + types TS + toggles no Settings**, e só depois a UI /community e as integrações de eventos de treino/online.