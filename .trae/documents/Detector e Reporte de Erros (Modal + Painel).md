## Contexto do projeto (já existe)
- Tabela no Supabase pronta para armazenar reports: `public.client_error_events` (com RLS; admin consegue ver).<mccoremem id="03fg454zq9de0w78cpo0zrk2i" />
- Modal global já existe: `DialogProvider` + `GlobalDialog`.
- Captura parcial de erros já existe: `ErrorBoundary`, `app/error.js` e `app/global-error.js`, além de listeners de `window.error/unhandledrejection` focados em chunk errors.

## Objetivo
- Ao surgir um erro relevante no client:
  - Abrir um modal para o usuário com **OK** e **Reportar**.
  - Ao clicar em **Reportar**, salvar o evento no Supabase.
  - Exibir os reports no **Painel de Controle** em uma nova aba **Erros**.

## Implementação (o que vou codar)
### 1) Reporter central no client
- Criar um util (ex.: `src/lib/clientErrorReporter.ts`) com:
  - `capture(error, context)`
  - Dedupe/rate-limit (evitar flood/loops) por assinatura por 60s.
  - Sanitização + truncamento (mensagem/stack/meta) para não gravar dados gigantes/sensíveis.

### 2) Capturar fontes de erro
- Integrar o `capture()` em:
  - `src/components/ErrorBoundary.js` (`componentDidCatch`).
  - `src/app/error.js` (segment error) e `src/app/global-error.js` (fatal).
  - `window.addEventListener('error')` e `window.addEventListener('unhandledrejection')` (sem conflitar com a lógica existente de chunk-reload do `layout.js`).

### 3) Modal com OK / Reportar
- Reutilizar `DialogContext.confirm()` para abrir o modal:
  - `cancelText: 'OK'`
  - `confirmText: 'Reportar'`
- Ao confirmar:
  - Chamar um endpoint `POST /api/errors/report`.
  - Mostrar feedback (ex.: toast simples “Reportado”).
- Se o usuário não estiver autenticado: mostrar apenas **OK** (porque a policy atual exige `auth.uid()` no insert).

### 4) Endpoint para salvar o report
- Implementar `POST /api/errors/report`:
  - Exige usuário autenticado.
  - Valida payload.
  - Insere em `client_error_events` usando Supabase server client (RLS-safe).

### 5) Aba “Erros” no Painel de Controle
- Adicionar aba **Erros** no `AdminPanelV2` (somente admin).
- Criar endpoint `GET /api/admin/errors/list` (requireRole admin + service role) para listar últimos N registros.
- UI:
  - Lista com data/hora, usuário, kind, message, url.
  - Drawer/expansão para ver `stack` e `meta`.
  - Botão “Atualizar”.

## Validação
- Forçar um erro no client e checar:
  - Modal abre.
  - “Reportar” cria linha no Supabase.
  - Aba “Erros” lista o item.
- Rodar `npm run lint` e `npm run build`.

Se estiver OK, eu começo a implementar agora.