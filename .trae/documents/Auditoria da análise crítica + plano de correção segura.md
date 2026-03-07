## Evidências reais dos problemas (com provas no repo)
- **Arquivos duplicados / versões paralelas**: existem muitos arquivos com sufixo ` 2`, ` 3`, etc. Exemplos (ativos e/ou em _archive):
  - Lista extensa retornada por glob: `_archive/duplicates/...` e também em caminhos ativos como [workouts/finish](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/workouts/finish) contendo [route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/workouts/finish/route.ts), **route 4.ts** e **route 4 (sem extensão)**.
  - O “canônico” de StudentDashboard é um re-export (indicando migração incompleta): [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx#L1-L2) aponta para `StudentDashboard3`.
- **Mistura de JS e TS em áreas críticas** (não é só estética; reduz proteção do TS):
  - Admin panel principal ainda é JS: [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js)
  - Fluxo crítico do treino ativo ainda é JS: [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)
  - Actions de alto impacto ainda são JS: [src/actions](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions) (admin/workout/chat).
- **Schema “full restore” desatualizado**: o arquivo atual tem apenas 6 tabelas (profiles, assessments, photos, messages, invites, team_sessions): [schema_full_restore.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/schema_full_restore.sql#L1-L85). 
  - Ao mesmo tempo, o app referencia e usa tabelas muito além disso, por exemplo em VIP: [limits.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/vip/limits.ts#L35-L154) usa `app_subscriptions`, `marketplace_subscriptions`, `app_plans`, `vip_usage_daily`.
  - Importante: **as migrations existem e são extensas** (boa notícia): [supabase/migrations](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations). Então o problema não é “não existir migrations”; o problema é **o schema_full_restore ser enganoso/desatualizado**.
- **OAuth origin realmente complexo** (conforme a análise): [auth/login/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/auth/login/route.ts#L17-L48) calcula `safeOrigin` a partir de `x-forwarded-*`, host, proto, env, etc.
- **Service Worker com múltiplas versões** (alto risco de cache/stale): existem `sw.js` + `sw 2.js` ... `sw 6.js` em [public](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/public).
- **Artefato de debug crítico no repo**: existe [login_loop_debug_report.json](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/login_loop_debug_report.json) documentando incidente real de loop de login.
- **Rate limiting nas APIs de IA**: não vi rate limiting por IP; o controle é por quota VIP (tabela `vip_usage_daily`) e auth. Exemplo: [ai/coach-chat](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/coach-chat/route.ts#L37-L52).
- **Pastas “backup” no repo**: existem [_legacy_backup](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/_legacy_backup) e [_macro_mixer_orig](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/_macro_mixer_orig).
- **Cobertura de testes baixa** (confirmado): apenas 4 testes unitários localizados em [__tests__](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src).

## O que já foi consertado (estado atual do repo)
- **Rotas admin com fallback Bearer e registro correto no App Router**: hoje as rotas admin relevantes aparecem como `route.ts` (ex.: [teachers/list](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/teachers/list/route.ts), [teachers/delete](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/teachers/delete/route.ts), [workouts/mine](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/workouts/mine/route.ts)).
- **Padronização de validação de token Bearer para admin** (padrão `requireRoleWithBearer`) existe em [utils/auth/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/auth/route.ts#L83-L105) e foi adotada em rotas admin.

## Plano de correção imediata (seguro / anti-quebra)
Princípios de segurança:
- Mudanças pequenas e isoladas; sempre rodar `lint + build` após cada “lote”.
- **Não tocar em auth bloqueado** (`src/app/auth/*`, `middleware.ts`, `utils/supabase/*`) sem você digitar exatamente: **"OVERRIDE AUTH LOCK"**.
- Em modais: manter layout e apenas acrescentar o que for pedido (sem alterações silenciosas).

### 1) Hotfix de integridade de rotas (zero regressão)
- Objetivo: eliminar risco de 404/parse por arquivos `route` inválidos/duplicados.
- Ações:
  - Remover/renomear corretamente quaisquer `route` sem extensão e variantes `route N` no **caminho ativo** (ex.: [workouts/finish](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/workouts/finish)).
  - Adicionar uma verificação automática (script) que falhe se existir `src/app/**/route` sem extensão ou `route [0-9]`.

### 2) Service Worker: reduzir risco de cache quebrado
- Objetivo: garantir que só exista 1 entrypoint de SW.
- Ações:
  - Definir `public/sw.js` como único SW ativo.
  - Mover/arquivar (fora do build) as variações `sw 2..6.js` ou removê-las.

### 3) “Fonte de verdade” do banco (sem mexer no banco agora)
- Objetivo: evitar onboarding quebrado e divergência mental.
- Ações:
  - Declarar `supabase/migrations/` como fonte de verdade.
  - Tratar `schema_full_restore.sql` como legado (ou regenerar a partir de migrations).

### 4) VIP/Billing: tornar diagnóstico observável (sem mudar lógica de cobrança ainda)
- Objetivo: reduzir “paguei e virei free sem saber”.
- Ações:
  - Instrumentar logs/telemetria quando cair em `FREE_LIMITS` por ausência de assinatura.
  - Criar endpoint/admin view simples para ver “entitlement calculado” e fonte (admin/RC/marketplace/free).

### 5) Testes mínimos anti-regressão (curtos e de alto ROI)
- Objetivo: travar regressões nas áreas mais perigosas.
- Ações:
  - Teste unitário para `getVipPlanLimits` cobrindo cascata `admin/teacher → app_subscriptions → marketplace_subscriptions → free`.
  - Teste “smoke” de rotas admin: pelo menos validação de shape de resposta (sem depender de DB real).

### 6) Autenticação/OAuth (bloqueado; só com override)
- Se você quiser atacar o “origin complexo”, eu proponho uma mudança mínima e reversível: fixar `redirectTo` por env + fallback; mas **isso exige OVERRIDE AUTH LOCK**.

## Meu relatório (curto e direto)
- **Risco nº1 hoje**: duplicação/arquivos “route N” e “route sem extensão” em caminhos ativos → pode quebrar rotas silenciosamente e gerar 404/500 difíceis de rastrear.
- **Risco nº2**: múltiplos service workers em `public/` → risco alto de comportamento inconsistente em produção por cache.
- **Risco nº3**: “documentos de schema” divergentes (schema_full_restore) → onboarding e debugging errados; felizmente migrations existem.
- **Dívida estrutural real**: AdminPanelV2 e ActiveWorkout em JS + lógica pesada → refatoração e bugs ficam caros; mas não é o primeiro passo (primeiro estabilizar infra).

---
Se você aprovar, eu executo o plano na ordem 1 → 2 → 3 → 5 (4 em paralelo opcional).