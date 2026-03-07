Você já tem hoje para seguidores: online, start/finish treino, create/edit treino, follow_request/accepted.

Abaixo vai um conjunto de notificações extras que fazem sentido **para quem segue um amigo**, com foco em valor (sem virar spam) + como eu implementaria.

## Sugestões de Notificações (para seguidores)
1) **PR / Recorde pessoal**
- Ex.: “João bateu PR no Supino: 100kg x 3”.
- Gatilho: ao salvar série/log de treino e detectar recorde.
- Preferência: `notifyFriendPRs`.

2) **Streak / Frequência**
- Ex.: “Maria completou 7 dias seguidos treinando”.
- Gatilho: ao finalizar treino e atualizar streak.
- Preferência: `notifyFriendStreaks`.

3) **Meta atingida**
- Ex.: “Pedro atingiu a meta de 10 treinos no mês”.
- Gatilho: evento de meta (mensal/semanal) ou milestone.
- Preferência: `notifyFriendGoals`.

4) **Novo treino publicado/compartilhado**
- Ex.: “Lucas publicou um treino novo: Peito e Tríceps”.
- (Você já tem create/edit, mas pode separar “publicar/compartilhar” quando virar algo social mesmo.)
- Preferência: `notifyFriendWorkoutPosts`.

5) **Avaliação/medidas atualizadas (se aplicável)**
- Ex.: “Ana atualizou medidas/avaliação”.
- Gatilho: ao criar assessment/medidas.
- Preferência: `notifyFriendAssessments`.

6) **Conquista/Badge**
- Ex.: “Conquista desbloqueada: 100 treinos”.
- Gatilho: sistema de achievements.
- Preferência: `notifyFriendAchievements`.

7) **Treino em equipe / convite**
- Ex.: “Fulano te convidou para treinar agora”.
- (Já existe `invite`, mas pode virar categoria social com toggle próprio.)
- Preferência: `notifyTeamInvites`.

## Regras anti-spam (recomendado)
- Throttle por tipo (ex.: PR no máximo 1/30min, online 1/15min, start 1/3min já existe).
- Agregação: “João fez 3 PRs hoje” em vez de 3 toasts.
- Respeitar privacidade: se usuário bloqueou social, não emitir.

## Plano de Implementação
1) Definir os novos `notifications.type` e atualizar a tipagem central (`src/types/social.ts`).
2) Criar chaves de preferência novas em `DEFAULT_SETTINGS` e nos modais (Configurações do app + Comunidade).
3) Implementar os gatilhos:
- PR/streak/meta/achievement: no ponto onde o app salva logs/finaliza treino/atualiza metas.
- Assessment: quando criar avaliação.
4) Inserir notificações com `insertNotifications` e filtrar destinatários via `filterRecipientsByPreference`.
5) Atualizar UI (ícones/títulos no NotificationCenter) e garantir que o toast mostre corretamente.
6) Validar com 2 usuários seguindo e com toggles on/off.

Se você me disser quais 2–3 você quer priorizar primeiro (minha sugestão: PR + streak + meta), eu implemento o pacote completo com toggles e throttle.