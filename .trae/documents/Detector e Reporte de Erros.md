## O Que Já Existe
- Já existe tabela no Supabase para armazenar erros do cliente: `public.client_error_events` (com RLS e SELECT para admin). Ela ainda não está conectada ao app.
- Já existe infraestrutura de modal global via `DialogProvider` + `GlobalDialog`.
- Já existe captura parcial de erros (ErrorBoundary/Next error pages), mas sem reporte remoto.

## Objetivo
- Quando ocorrer um erro não tratado, abrir um modal para o usuário com:
  - Mensagem do erro
  - Botão **OK**
  - Botão **Reportar para a equipe**
- Ao clicar em **Reportar**, salvar o evento e exibir no **Painel de Controle** em uma nova aba **Erros Reportados**.

## Implementação
### 1) Captura global de erros (client)
- Criar um módulo central (ex.: `src/lib/clientErrorReporter.*`) que:
  - Escuta `window.error` e `window.unhandledrejection`.
  - Recebe erros do `ErrorBoundary` e das páginas `app/error.js` e `app/global-error.js`.
  - Normaliza payload: `kind`, `message`, `stack`, `url`, `userAgent`, `meta` (ex.: `digest`, `componentStack`, `appVersion`, `route`).
  - Faz dedupe (evitar loop/spam) por assinatura `kind+message+stack+route` por ~30–60s.

### 2) Modal para usuário
- Reutilizar o modal global existente (`confirm()` do `DialogContext`) com textos customizados:
  - `cancelText: "OK"`
  - `confirmText: "Reportar"`
- Ao confirmar (Reportar), chamar um endpoint server-side de reporte.
- Se o usuário estiver deslogado, manter **OK** e ocultar/desabilitar **Reportar** (porque a policy atual exige usuário autenticado).

### 3) Endpoint para registrar o erro
- Criar `POST /api/errors/report` que:
  - Exige usuário autenticado.
  - Valida payload e remove dados sensíveis.
  - Insere em `public.client_error_events` (via Supabase server client com RLS).
  - Retorna `{ ok: true, id }`.

### 4) Aba nova no Painel de Controle (AdminPanelV2)
- Adicionar aba **Erros** (apenas `admin`) no `AdminPanelV2`.
- Criar `GET /api/admin/errors/list` (requireRole admin) usando `createAdminClient()` para:
  - Listar os últimos N erros (ex.: 200) ordenados por `created_at desc`.
  - (Opcional) incluir dados básicos do perfil do usuário (display_name, role).
- UI da aba:
  - Lista com `data/hora`, `usuário`, `kind`, `message`, `url`.
  - Clique em um item abre detalhes (`stack`, `meta` formatado) dentro do painel.
  - Botão **Atualizar**.

## Validação
- Simular erro no client e confirmar:
  - Modal aparece.
  - Clicar **Reportar** cria registro no Supabase.
  - Aba **Erros** exibe o item imediatamente após atualizar.
- Rodar `npm run lint` e `npm run build`.

## Observações de segurança
- Sanitizar dados do erro antes de salvar (não gravar tokens/query strings sensíveis; truncar stack grande).
- Rate limit/dedupe para evitar flood.

Vou implementar exatamente isso agora (captura + modal + endpoint + nova aba no painel).