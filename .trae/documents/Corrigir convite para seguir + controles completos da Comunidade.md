Pelo print, você enviou convite para o Maicon (status fica “Aguardando aprovação” pra você), mas ele não vê nada no menu de notificações.

**Causa mais provável (pelo código e schema):**
- O convite de seguir (`follow_request`) tenta inserir na tabela `notifications` com colunas novas (`sender_id`, `recipient_id`, `metadata`, `is_read`). Se o Supabase desse ambiente ainda está com a tabela `notifications` antiga (sem essas colunas), o insert falha, o convite fica só em `social_follows` (por isso você vê “pendente”), e o Maicon não recebe notificação.
- Mesmo quando o schema está ok, a notificação pode ser suprimida se o Maicon tiver `notifySocialFollows = false` no `user_settings`.

## Plano
## 1) Deixar o sistema de convite “redondo” (sempre entrega)
- Tornar a inserção de notificações resiliente a schema antigo:
  - Atualizar `insertNotifications` para, se der erro de “coluna não existe”, fazer retry inserindo apenas colunas básicas (`user_id`, `title`, `message`, `type`, `read`).
  - Assim o Maicon recebe no menu mesmo que o banco ainda não tenha as colunas sociais.
- Ajustar o fluxo do convite de seguir para reportar corretamente o estado:
  - No endpoint `/api/social/follow`, incluir no retorno um campo `notified: true/false` (apenas informativo) para facilitar diagnóstico.

Arquivos:
- `src/lib/social/notifyFollowers.js`
- `src/app/api/social/follow/route.ts`

## 2) Controles completos no menu de configurações da Comunidade
- Implementar um modal “Configurações da Comunidade” dentro da tela `/community` com toggles e salvar no `user_settings`.
- Controles incluídos (controle total):
  - `inAppToasts` (card flutuante)
  - `notifySocialFollows` (notificação de solicitações/aceite)
  - `notifyFriendOnline`
  - `notifyFriendWorkoutEvents`
  - **Novo:** `allowSocialFollows` (permitir/bloquear receber convites de seguir)
- Atualizar `DEFAULT_SETTINGS` e `SettingsModal` (do app inteiro) para também incluir `allowSocialFollows`, mantendo tudo consistente.

Arquivos:
- `src/app/(app)/community/CommunityClient.tsx`
- `src/hooks/useUserSettings.js`
- `src/components/SettingsModal.js`
- `src/app/api/social/follow/route.ts` (respeitar `allowSocialFollows`: se bloqueado, não cria `social_follows` e retorna erro claro)

## 3) Validação
- Testar 2 usuários:
  - Caso padrão: Maicon com `notifySocialFollows=true` → recebe notificação no menu + toast.
  - Caso bloqueado: Maicon com `allowSocialFollows=false` → botão “Seguir” retorna mensagem de bloqueio e não cria pendência.
- Rodar `npm run build`.

Se confirmado, eu implemento essas mudanças e valido os cenários acima.