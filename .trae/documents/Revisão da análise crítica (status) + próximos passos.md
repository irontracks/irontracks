## Status item-a-item (o que mudou vs. o que ainda falta)

### 1) Dívida Técnica Estrutural
- **Proliferação de arquivos duplicados**
  - **Resolvido parcialmente (no que quebrava o app):**
    - Removi variantes de rotas inválidas em `src/app` (ex.: `route N` e `route` sem extensão). Hoje `src/app/**/route` e `src/app/**/route [0-9]*` não existem.
  - **Ainda existe (não resolvido):**
    - Duplicatas/arquivos “ 2 / 3” e sem extensão continuam espalhados em áreas ativas e archive.
    - Exemplo ativo: [offlineSync.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/lib/offline/offlineSync.js) coexistindo com `src/lib/offline/offlineSync 2` (sem extensão).
    - Exemplo ativo: `src/utils/supabase/middleware - cópia.ts` coexistindo com `src/utils/supabase/middleware.ts`.

- **Mistura de JS e TypeScript sem critério**
  - **Não foi resolvido** (não era parte do hotfix):
    - Continua existindo [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js), [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js) e actions JS em [src/actions](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions).

- **Schema desatualizado e incompleto**
  - **Resolvido parcialmente (clareza):**
    - [schema_full_restore.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/schema_full_restore.sql) agora está marcado como legado/incompleto e a fonte de verdade fica explícita: [supabase/migrations](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations).
  - **Ainda falta:**
    - Gerar/fornecer um “schema atual” coerente (ou um README de setup) derivado das migrations para onboarding.

### 2) Autenticação e Controle de Acesso
- **Lógica de origem do OAuth excessivamente complexa**
  - **Resolvido:** simplifiquei `safeOrigin` para priorizar env (`IRONTRACKS_PUBLIC_ORIGIN` / `NEXT_PUBLIC_APP_URL` / `APP_BASE_URL`) e usar `x-forwarded-*` como fallback.
  - Arquivos: [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts), [auth/callback/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/callback/route.ts).

- **Aprovação de aluno como boolean simples**
  - **Não foi resolvido:** ainda é o modelo booleano (requer mudança de schema + UI + auditoria).

- **Ausência de rate limiting visível nas APIs de IA**
  - **Não foi resolvido:** há quota por usuário via `vip_usage_daily`, mas não há rate limiting IP/sessão não autenticada visível.

### 3) Monetização e Sistema VIP
- **Dois caminhos de cobrança sem unificação**
  - **Não foi resolvido (unificação):** continua cascata `role → app_subscriptions → marketplace_subscriptions`.
  - **Mitigação feita:** acrescentei diagnóstico observável:
    - `getVipPlanLimits` agora retorna `source/debug` em [limits.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/vip/limits.ts).
    - `/api/vip/status` inclui `source/debug`: [vip/status/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/vip/status/route.ts).
    - Novo endpoint admin: [admin/vip/entitlement](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/vip/entitlement/route.ts).

- **Feature flags sem lifecycle**
  - **Não foi resolvido:** [featureFlags.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/featureFlags.js) segue sem owner/data.

- **Limites VIP no free tier (chat 0, wizard 0)**
  - **Não foi resolvido:** `FREE_LIMITS` continua `chat_daily: 0`, `wizard_weekly: 0`.

### 4) Arquitetura de Componentes
- **AdminPanelV2/ActiveWorkout grandes e sem divisão**
  - **Não foi resolvido:** ainda são grandes e em JS.

### 5) Offline e PWA
- **Múltiplas versões do Service Worker**
  - **Resolvido:** agora só existe [public/sw.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/public/sw.js).
- **offlineSyncV2 atrás de flag / duplicação offline**
  - **Não foi resolvido:** ainda há arquivos duplicados/sem extensão em `src/lib/offline`.

### 6) Qualidade e Testes
- **Cobertura de testes baixa**
  - **Melhorado parcialmente:** adicionei `test:smoke` e smoke tests para evitar regressão de rotas/admin/VIP.
  - **Ainda insuficiente:** não há testes automatizados robustos para auth callback, billing webhooks, offline sync.

- **login_loop_debug_report.json na raiz**
  - **Não foi resolvido:** o arquivo ainda existe: [login_loop_debug_report.json](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/login_loop_debug_report.json).

### 7) Pastas de backup no repo
- **_legacy_backup** e **_macro_mixer_orig**
  - **Não foi resolvido:** ambas ainda existem.

## Plano seguro para “fechar” o que falta (anti-quebra)
### 1) Limpeza segura de duplicados (foco no que está em paths ativos)
- Mapear arquivos ativos com `" 2"/" 3"` e sem extensão (ex.: `offlineSync 2`, `_probe 2`, `middleware - cópia.ts`).
- Definir canônico por import graph (o que é realmente importado pelo app).
- Remover ou mover para `_archive/duplicates` o que não é importado.
- Adicionar verificação de “arquivos sem extensão em src/” (opcional) para evitar reintrodução.

### 2) Higiene de repositório (debug e backups)
- Mover `login_loop_debug_report.json` para `claude/` ou `docs/` (ou remover se não for necessário).
- Remover `_legacy_backup` e `_macro_mixer_orig` do repo (ou mover para `_archive/`), mantendo apenas o que for realmente usado.

### 3) Rate limiting mínimo para IA
- Implementar rate limiting leve por IP + userId (em memória/DB) para `/api/ai/*` além do `vip_usage_daily`.

### 4) Aprovação de aluno com audit trail (mudança de schema)
- Migrar boolean → status + `approved_at/approved_by` e atualizar UI/fluxos.

### 5) Feature flags com lifecycle
- Criar convenção: owner + data de revisão + ticket/nota.
- Remover flags “maduras” (quando confirmado) para reduzir complexidade.

### 6) Testes de alto ROI
- Smoke tests adicionais para auth routes e para “rotas críticas existem e respondem shape esperado”.
- Testes unitários de helpers críticos (VIP, normalização, parsers) e 1–2 testes de integração simples.
