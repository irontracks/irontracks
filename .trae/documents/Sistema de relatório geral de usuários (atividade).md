## Objetivo
- Criar um “Relatório Geral de Usuários” dentro da aba **SISTEMA** do [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js), com:
  - Lista/pesquisa de usuários (aluno/professor) com nome/foto/role.
  - Ao selecionar um usuário, abrir um card/timeline com tudo que ele fez no app (ações e cliques rastreados), incluindo treinos (criar/editar/deletar/finalizar) e navegação principal.
  - Ajuda para diagnóstico: visualizar erros reportados pelo usuário (já existe `error_reports`).

## Estado atual (o que já existe para reaproveitar)
- Modal “Painel de Controle” e aba **SISTEMA** já existem (admin only) em [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js).
- Já existe infra de logs:
  - `error_reports` + endpoint `/api/errors/report`.
  - `onboarding_events` (eventos do tour).

## Implementação (o que vou construir)
### 1) Banco (Supabase)
- Criar tabela `user_activity_events` (migration) para armazenar eventos do app:
  - Campos: `id`, `created_at`, `user_id`, `role`, `display_name_snapshot`, `event_name`, `event_type`, `screen`, `path`, `metadata jsonb`, `client_ts`, `user_agent`, `app_version`.
  - Índices: `(user_id, created_at desc)`, `(event_name, created_at desc)`.
  - RLS: leitura apenas para `admin/service_role`; inserção via API (service role) para evitar expor permissões complexas.
  - Retenção (opcional, fase 2): política de cleanup (ex.: 90 dias) via job/cron.

### 2) API Admin (server-side)
- Criar endpoints:
  - `GET /api/admin/user-activity/users` → lista perfis (id, display_name, photo_url, role, last_seen) com busca.
  - `GET /api/admin/user-activity/events?user_id=...&from=...&to=...&limit=...` → timeline paginável.
  - `GET /api/admin/user-activity/summary?user_id=...&range=7d` → contagem por evento (top ações) para “o que mais usa”.
- Guardas: exigir login e role `admin` (mesma checagem usada nas rotas `/api/admin/*`).

### 3) Captura de eventos (client-side)
- Criar util `trackUserEvent()` com fila/batch:
  - Buffer em memória + fallback localStorage (para offline/intermitência).
  - Envio por `navigator.sendBeacon` quando possível, senão `fetch`.
  - Dedup/throttle para evitar spam (ex.: mesmo evento repetido em 1–2s).
- Criar endpoint `POST /api/telemetry/user-event` que valida usuário (`requireUser`) e insere em `user_activity_events` via `createAdminClient`.

### 4) Instrumentação (quais ações serão logadas no início)
- Ações essenciais (alta utilidade, baixo ruído):
  - `workout_create`, `workout_update`, `workout_delete`, `workout_finish`.
  - `open_screen` (troca de view principal: dashboard, history, chat, report, etc.).
  - Cliques-chave: “Novo Treino”, “Iniciar Treino”, “Finalizar Treino”, “Compartilhar”, “Postar no IronTracks”, “Abrir Painel de Controle”, “Abrir SISTEMA”, “Abrir Novos Recordes/Iron Rank”.
- Integrações onde já há eventos/erros:
  - Relacionar com `error_reports` no relatório do usuário (mostrar últimos erros dele).
  - Importar/espelhar `onboarding_events` no painel (ou exibir junto como seção).

### 5) UI no AdminPanelV2 (aba SISTEMA)
- Adicionar uma sub-aba/seção “Relatório de Usuários”:
  - Coluna esquerda: busca + lista de usuários.
  - Coluna direita: card do usuário selecionado com:
    - Resumo (últimos 7/30 dias: treinos finalizados/criados/editados, top botões).
    - Timeline (eventos ordenados por data) com filtros (período, tipo, texto).
    - Bloco “Erros recentes” (de `error_reports`).

## Validação
- Testar manualmente:
  - Fazer ações no app (criar/editar/finalizar treino; clicar botões chave).
  - Confirmar que eventos aparecem no relatório do usuário em tempo real.
  - Confirmar que apenas admin acessa os endpoints.
- Rodar `npm run build`.

## Observações de privacidade/performance
- Não vou registrar texto sensível (mensagens de chat, notas completas) — só metadados mínimos (ids, nomes de telas, contagens).
- O tracking será “opt-in” no sentido de ser aplicado só nos pontos instrumentados (não é um keylogger/global click-capture).
