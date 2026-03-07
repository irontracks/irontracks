## Objetivo
- Quando ocorrer um erro inesperado no app, abrir um **modal** com:
  - mensagem do erro
  - botões **OK** e **Reportar para a equipe**
- Ao reportar, salvar o erro no banco e exibir no **Painel de Controle** em uma nova aba “Erros reportados”.

## Onde encaixa bem no projeto
- O app já tem:
  - `DialogProvider` + `GlobalDialog` (modais globais)
  - `ErrorBoundary` (captura erros de render)
  - `AdminPanelV2` (tabs e gestão)

## Implementação
### 1) Banco (Supabase)
- Criar tabela `error_reports` com campos:
  - `id uuid pk`, `created_at timestamptz`, `user_id uuid`, `user_email text`
  - `message text`, `stack text`, `source text` (errorboundary/window/unhandledrejection)
  - `pathname text`, `url text`, `user_agent text`, `app_version text`
  - `meta jsonb` (qualquer contexto extra)
  - `status text default 'open'`, `resolved_at timestamptz`, `resolved_by uuid`
- RLS:
  - `insert`: autenticado, `user_id = auth.uid()`
  - `select/update`: apenas admin (`public.is_admin()` já existe)

### 2) Endpoint para reportar
- Criar `POST /api/errors/report`:
  - valida usuário (`createClient()`/`auth.getUser()` ou `requireUser()`)
  - faz insert em `error_reports`
  - retorna `{ ok: true, id }`
- Sanitização: nunca salvar tokens/cookies; limitar tamanho de `message/stack`.

### 3) Detector no cliente + modal
- Criar um `ErrorReporterProvider` (client) que:
  - escuta `window.onerror` e `window.onunhandledrejection`
  - deduplica por “assinatura” (message+stack+rota) e aplica throttle para não spammar
  - abre um modal usando `confirm()` do `DialogContext`:
    - cancelText: `OK`
    - confirmText: `Reportar para a equipe`
  - se o usuário clicar em reportar: chama `/api/errors/report` e mostra `alert('Erro reportado, obrigado!')`

### 4) Integrar com `ErrorBoundary`
- Atualizar `ErrorBoundary` para, ao capturar erro, também acionar o `ErrorReporterProvider` (por callback/contexto).
- Mantém a tela de fallback, mas o modal também aparece (para cumprir o requisito “janela/modal”).

### 5) Aba nova no Painel de Controle
- Em `AdminPanelV2`:
  - adicionar tab “Erros” (visível só para admin)
  - listar `error_reports` (paginado + busca por texto)
  - ações: marcar como “Resolvido” e “Reabrir” (update de status)
  - botão “Atualizar”

## Validação
- Simular erro (throw em componente / Promise rejeitada) e verificar:
  - modal aparece
  - report salva
  - aparece na aba “Erros” do admin
- Rodar lint/build.

Se você aprovar, eu implemento tudo isso (migração + endpoint + detector + aba no painel) numa tacada só.