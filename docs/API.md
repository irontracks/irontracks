# API Reference — IronTracks

> **125 endpoints** organizados por domínio. Todos os endpoints são Next.js Route Handlers em `src/app/api/`.  
> **Auth**: a maioria exige sessão Supabase válida via cookie (`Authorization: Bearer <token>` ou cookie `sb-*`).

---

## Workout

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET/POST | `/api/workouts/list` | Lista treinos do usuário autenticado | ✅ |
| GET | `/api/workouts/history` | Histórico paginado de treinos completados | ✅ |
| POST | `/api/workouts/finish` | Finaliza sessão ativa e gera relatório | ✅ |
| PATCH | `/api/workouts/update` | Atualiza campos de um treino existente | ✅ |

## AI / IA

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/ai/post-workout-insights` | Gera insights Gemini do treino concluído | ✅ |
| POST | `/api/ai/workout-wizard` | Cria plano de treino via IA | ✅ |
| POST | `/api/ai/coach-chat` | Chat com coach IA (plano VIP) | ✅ VIP |
| POST | `/api/ai/vip-coach` | Coach IA avançado para VIP | ✅ VIP |
| POST | `/api/ai/chef-ia` | Sugestões nutricionais via IA | ✅ |
| POST | `/api/ai/apply-progression-next` | Aplica progressão sugerida pela IA ao template | ✅ |
| POST | `/api/ai/team-workout-insights` | Insights de treino em equipe via Gemini | ✅ |
| GET/POST | `/api/ai/exercise-muscle-map` | Mapa muscular de exercício via IA | ✅ |
| POST | `/api/ai/exercise-muscle-map-backfill` | Backfill do mapa muscular em lote | ✅ Admin |
| GET | `/api/ai/muscle-map-day` | Ativação muscular do dia | ✅ |
| GET | `/api/ai/muscle-map-week` | Ativação muscular da semana | ✅ |
| POST | `/api/ai/nutrition-estimate` | Estimativa nutricional de refeição via IA | ✅ |

## Social — Stories

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/social/stories/list` | Feed de stories disponíveis | ✅ |
| POST | `/api/social/stories/create` | Cria novo story (texto/mídia) | ✅ |
| DELETE | `/api/social/stories/delete` | Remove story próprio | ✅ |
| POST | `/api/social/stories/like` | Curtir/descurtir story | ✅ |
| POST | `/api/social/stories/view` | Registrar visualização de story | ✅ |
| GET | `/api/social/stories/views` | Visualizações de um story | ✅ |
| POST | `/api/social/stories/comments` | Comentar em story | ✅ |
| POST | `/api/social/stories/media` | Upload de mídia para story | ✅ |

## Social — Follows e Presença

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/social/follow` | Seguir usuário | ✅ |
| POST | `/api/social/follow/cancel` | Cancelar solicitação de follow | ✅ |
| POST | `/api/social/follow/respond` | Aceitar/rejeitar solicitação | ✅ |
| GET | `/api/social/presence/list` | Lista usuários em treino agora | ✅ |
| POST | `/api/social/presence/ping` | Anuncia presença em treino ativo | ✅ |
| POST | `/api/social/workout-start` | Notifica início de treino aos seguidores | ✅ |

## Chat

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET/POST | `/api/chat/messages` | Mensagens de chat (DM ou grupo) | ✅ |
| POST | `/api/chat/send` | Envia mensagem | ✅ |
| DELETE | `/api/chat/delete` | Apaga mensagem | ✅ |
| GET | `/api/chat/global-id` | Resolve ID global de chat | ✅ |
| POST | `/api/chat/direct-dedupe` | Deduplicação de chats diretos | ✅ |

## VIP

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/vip/status` | Status VIP do usuário | ✅ |
| GET | `/api/vip/access` | Verifica acesso a feature VIP | ✅ |
| GET | `/api/vip/profile` | Perfil VIP do usuário | ✅ |
| POST | `/api/vip/welcome-seen` | Marca welcome VIP como visto | ✅ |
| GET | `/api/vip/welcome-status` | Status do welcome VIP | ✅ |
| GET | `/api/vip/weekly-summary` | Resumo semanal VIP via IA | ✅ VIP |
| GET/POST | `/api/vip/chat/messages` | Chat VIP com coach | ✅ VIP |
| POST | `/api/vip/chat/thread` | Cria thread de chat VIP | ✅ VIP |
| GET | `/api/vip/periodization/active` | Periodização ativa | ✅ VIP |
| POST | `/api/vip/periodization/create` | Cria periodização com IA | ✅ VIP |
| GET | `/api/vip/periodization/stats` | Estatísticas de periodização | ✅ VIP |
| DELETE | `/api/vip/periodization/cleanup` | Remove periodizações expiradas | ✅ VIP |
| GET | `/api/user/vip-credits` | Créditos VIP disponíveis | ✅ |

## Billing & Pagamentos

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/app/plans` | Lista planos disponíveis | Público |
| POST | `/api/app/checkout` | Inicia checkout MercadoPago | ✅ |
| POST | `/api/app/subscriptions/cancel-active` | Cancela assinatura ativa | ✅ |
| POST | `/api/app/subscriptions/cancel-pending` | Cancela assinatura pendente | ✅ |
| POST | `/api/billing/revenuecat/sync` | Sincroniza compras nativas (RevenueCat) | ✅ |
| POST | `/api/billing/webhooks/mercadopago` | Webhook de pagamento MercadoPago | Webhook |

## Professor / Aluno

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/teachers/me` | Perfil do professor autenticado | ✅ |
| GET | `/api/teachers/wallet` | Saldo do professor | ✅ |
| POST | `/api/teachers/accept` | Aceita convite de aluno | ✅ |
| GET | `/api/students/me/status` | Status de vínculo com professor | ✅ |
| GET/POST | `/api/teacher/inbox/feed` | Feed de mensagens da caixa de entrada | ✅ |
| POST | `/api/teacher/inbox/action` | Ação em item da caixa de entrada | ✅ |
| POST | `/api/teacher/inbox/send-message` | Envia mensagem para aluno | ✅ |
| GET | `/api/teacher/execution-videos/by-student` | Vídeos de execução por aluno | ✅ |
| POST | `/api/teacher/execution-videos/review` | Review de vídeo de execução | ✅ |

## Marketplace

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/marketplace/plans` | Lista planos no marketplace | Público |
| GET | `/api/marketplace/health` | Health check do marketplace | Público |
| POST | `/api/marketplace/webhooks/asaas` | Webhook Asaas (pagamentos BR) | Webhook |

## Exercícios & Biblioteca

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/exercises/search` | Busca exercícios (com cache Redis) | ✅ |
| POST | `/api/exercises/canonicalize` | Canonicaliza nome de exercício | ✅ |
| POST | `/api/exercise-library/resolve` | Resolve alias para nome canônico | ✅ |

## Execução em Vídeo

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/execution-videos/prepare` | Prepara upload de vídeo | ✅ |
| POST | `/api/execution-videos/complete` | Confirma upload concluído | ✅ |
| GET | `/api/execution-videos/media` | Serve/assina URL de mídia | ✅ |

## Auth

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/auth/session` | Retorna sessão atual | ✅ |
| GET | `/api/auth/ping` | Verifica se sessão é válida | ✅ |
| POST | `/api/auth/recovery-code` | Valida código de recuperação | Público |
| POST | `/api/auth/apple/preflight` | Preflight para Apple Sign-In | Público |

## Push Notifications

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/push/register` | Registra token de push do dispositivo | ✅ |
| POST | `/api/push/test` | Envia push de teste | ✅ |
| POST | `/api/notifications/direct-message` | Notifica por DM | ✅ |
| POST | `/api/notifications/appointment-created` | Notifica criação de appointment | ✅ |

## Storage

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/storage/signed-upload` | URL assinada para upload direto | ✅ |
| POST | `/api/storage/social-stories/signed-upload` | URL assinada para stories | ✅ |
| POST | `/api/storage/sign-cloudinary` | Assinatura para Cloudinary | ✅ |
| POST | `/api/storage/ensure-bucket` | Garante bucket Supabase existe | ✅ Admin |
| DELETE | `/api/storage/purge-chat-media` | Remove mídia de chat antiga | ✅ |

## Dashboard & Updates

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/dashboard/bootstrap` | Dados iniciais do dashboard | ✅ |
| GET | `/api/updates/unseen` | Atualizações não vistas | ✅ |
| POST | `/api/updates/mark-viewed` | Marca atualização como vista | ✅ |
| POST | `/api/updates/mark-prompted` | Marca que usuário foi notificado | ✅ |
| GET | `/api/feature-flags` | Feature flags ativos para o usuário | ✅ |
| GET | `/api/version` | Versão do servidor | Público |

## Assessments & Saúde

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/assessment-scanner` | Scanner de assessment corporal via IA | ✅ |
| POST | `/api/iron-scanner` | Scanner Iron (análise corporal avançada) | ✅ |
| POST | `/api/calories/estimate` | Estimativa de calorias de refeição | ✅ |

## Telemetria & Diagnóstico

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/telemetry/user-event` | Registra evento de usuário | ✅ |
| POST | `/api/errors/report` | Reporta erro do cliente | ✅ |
| GET | `/api/profiles/ping` | Ping de perfil (keepalive) | ✅ |
| GET | `/api/supabase/status` | Status da conexão Supabase | ✅ Admin |
| GET | `/api/access-request/create` | Solicita acesso à plataforma | Público |
| GET | `/api/debug/cookies` | Debug de cookies (dev only) | ✅ |
| GET | `/api/diagnostics/workouts` | Diagnóstico de treinos | ✅ Admin |
| GET | `/api/diagnostics/iron-rank` | Diagnóstico do Iron Rank | ✅ Admin |
| GET | `/api/diagnostics/chat` | Diagnóstico do chat | ✅ Admin |

## Cron Jobs

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| POST | `/api/cron/cleanup-expired` | Remove dados expirados | Cron secret |
| POST | `/api/cron/purge-soft-delete-bin` | Purga soft-deletions antigas | Cron secret |
| POST | `/api/jobs/process-story` | Processa story pendente (job) | Cron secret |

## Admin

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| GET | `/api/admin/workouts/history` | Histórico de treinos de qualquer user | ✅ Admin |
| GET | `/api/admin/workouts/by-student` | Treinos por aluno | ✅ Admin |
| GET | `/api/admin/workouts/templates-list` | Lista templates | ✅ Admin |
| GET | `/api/admin/workouts/mine` | Treinos do admin | ✅ Admin |
| DELETE | `/api/admin/workouts/delete` | Deleta treino | ✅ Admin |
| DELETE | `/api/admin/workouts/delete-any` | Deleta qualquer treino | ✅ Admin |
| POST | `/api/admin/workouts/sync-templates` | Sincroniza templates | ✅ Admin |
| POST | `/api/admin/workouts/normalize-titles` | Normaliza títulos de treinos | ✅ Admin |
| GET | `/api/admin/students/list` | Lista alunos | ✅ Admin |
| GET | `/api/admin/students/status` | Status de aluno | ✅ Admin |
| POST | `/api/admin/students/assign-teacher` | Atribui professor a aluno | ✅ Admin |
| GET | `/api/admin/teachers/list` | Lista professores | ✅ Admin |
| GET | `/api/admin/teachers/status` | Status de professor | ✅ Admin |
| POST | `/api/admin/teachers/promote` | Promove usuário a professor | ✅ Admin |
| DELETE | `/api/admin/teachers/delete` | Remove professor | ✅ Admin |
| GET | `/api/admin/teachers/inbox` | Inbox do professor | ✅ Admin |
| GET | `/api/admin/teachers/workouts/history` | Histórico de treinos do professor | ✅ Admin |
| GET | `/api/admin/teachers/workouts/templates` | Templates do professor | ✅ Admin |
| POST | `/api/admin/teachers/asaas` | Dados Asaas do professor | ✅ Admin |
| GET | `/api/admin/teachers/students` | Alunos do professor | ✅ Admin |
| GET | `/api/admin/vip/list` | Lista usuários VIP | ✅ Admin |
| GET | `/api/admin/vip/status` | Status VIP de usuário | ✅ Admin |
| POST | `/api/admin/vip/grant-trial` | Concede trial VIP | ✅ Admin |
| POST | `/api/admin/vip/entitlement` | Gerencia entitlement VIP | ✅ Admin |
| DELETE | `/api/admin/vip/revoke` | Revoga acesso VIP | ✅ Admin |
| GET | `/api/admin/vip/grant-history` | Histórico de grants VIP | ✅ Admin |
| POST | `/api/admin/vip/batch-status` | Status VIP em lote | ✅ Admin |
| GET | `/api/admin/legacy-students` | Alunos legados (migração) | ✅ Admin |
| GET | `/api/admin/user-activity/users` | Usuários por atividade | ✅ Admin |
| GET | `/api/admin/user-activity/summary` | Resumo de atividade | ✅ Admin |
| GET | `/api/admin/user-activity/events` | Eventos de usuário | ✅ Admin |
| GET | `/api/admin/access-requests/list` | Lista solicitações de acesso | ✅ Admin |
| POST | `/api/admin/access-requests/action` | Aprova/rejeita solicitação | ✅ Admin |
| POST | `/api/admin/exercise-videos/suggest` | Sugere vídeo de exercício | ✅ Admin |
| POST | `/api/admin/exercise-videos/backfill` | Backfill de vídeos | ✅ Admin |
| POST | `/api/admin/exercises/canonicalize/backfill` | Backfill de nomes canônicos | ✅ Admin |

---

> 💡 Para detalhes de request/response de um endpoint específico, leia o arquivo `src/app/api/<caminho>/route.ts`.
