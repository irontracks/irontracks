## Objetivo
Fechar os itens que ainda faltam na análise crítica com **risco mínimo de regressão**, garantindo: fonte única de regras (VIP/entitlements), enforcement real de limites, redução de dívida estrutural (JS→TS + refactors) e testes/guardrails para impedir retorno da bagunça.

## Princípios “infalíveis” (guardrails)
- **Mudanças pequenas e verificáveis**: cada etapa precisa de critério de aceite objetivo + build + smoke.
- **Compatibilidade por 1 ciclo**: toda migração de schema/contrato mantém fallback (ex.: aceitar campo antigo e novo em paralelo).
- **Fonte única de verdade**: onde houver regra duplicada (VIP, gates, filtros), centralizar em 1 helper e banir duplicações.
- **Rollback simples**: preferir migrações additive (ADD COLUMN, CREATE VIEW/RPC) antes de remover/renomear. Remoção só depois de validação.
- **Proteção automática**: qualquer classe de bug já vista vira teste/smoke.

## Fase 1 — Unificar Entitlements/VIP (fonte única)
### Problema
Hoje existem implementações divergentes de “VIP” em endpoints diferentes (alguns não consideram `trialing`, outros não usam o mesmo cálculo de tier/limits), e há também divergência de role resolver.

### Ações
1) Eleger **um único contrato**: `{ tier, limits, source, usage }` como retorno “oficial”.
2) Centralizar o cálculo server-side em 1 helper reutilizável:
   - consolidar `getVipPlanLimits` + regra de role (inclui `resolveRoleByUser`).
3) Refatorar endpoints que hoje calculam VIP por conta própria para usar o helper:
   - `/api/vip/access`
   - `/api/vip/chat/*`
   - qualquer rota que tenha `computeVipAccess`/query de subscriptions manual.
4) Normalizar status elegível (`active/past_due/trialing`) de forma consistente.
5) Adicionar smoke test que falha se algum endpoint VIP voltar a conter query direta de subscription/role sem passar pelo helper.

### Critérios de aceite
- Todos endpoints VIP retornam tier/limits calculados do mesmo jeito.
- Nenhum endpoint VIP tem lógica duplicada de “isVip”/“computeVipAccess”.
- `/api/admin/vip/entitlement` bate 1:1 com o cálculo do app.

### Rollback
- O helper mantém compatibilidade com `plan_id` antigos e, se faltar plano, registra `source=*_missing_plan` e faz fallback (sem quebrar API).

## Fase 2 — Free tier limits (enforcement real, não só UI)
### Problema
Alguns limites (ex.: `history_days`) são aplicados no client depois de baixar dados; isso não é enforcement.

### Ações
1) Mover o carregamento de histórico para uma rota server-side que:
   - calcula `history_days` via entitlements
   - filtra no servidor por data/paginação
   - retorna também `blocked_count` se necessário para UX.
2) Ajustar o client (HistoryList) para consumir essa rota.
3) (Opcional robusto) Criar view/RPC no Postgres para o “history limited” e facilitar performance.

### Critérios de aceite
- Usuário free não consegue obter histórico fora do limite nem via network.
- Paginação/limite garante performance (sem `.limit(200)` cego no client).

### Rollback
- Manter por 1 ciclo um fallback: se a rota falhar, volta ao comportamento antigo **somente em dev**, e em prod retorna erro amigável.

## Fase 3 — Migração JS → TS (progressiva, sem dor)
### Problema
Arquivos críticos ainda em `.js`, e a tipagem não protege esses pontos.

### Ações
1) Definir “escopo por risco”, começando por utilitários puros e actions (baixo risco):
   - actions (chat/workout)
   - utils de domínio (VIP helpers, parsers, normalizadores)
2) Converter em etapas:
   - `.js → .ts` (ou `.tsx`)
   - adicionar tipos mínimos (interfaces de payload) e refinar depois
3) Só depois migrar componentes grandes:
   - `AdminPanelV2.js`
   - `ActiveWorkout.js`
4) Regra: cada conversão precisa de build + smoke + (se aplicável) teste unitário.

### Critérios de aceite
- Arquivos críticos migrados têm tipos nas bordas (inputs/outputs) e não quebram runtime.
- Redução clara de “any”/casting agressivo ao longo de iterações.

### Rollback
- Conversões em PRs pequenos por arquivo/feature.

## Fase 4 — Refatorar AdminPanelV2 (sem mudar UX)
### Problema
Arquivo concentra fetching, lógica de negócio e UI.

### Ações
1) Extrair “data layer” em hooks/serviços:
   - `useAdminStudents`, `useAdminTeachers`, `useAdminWorkoutsHistory`, etc.
2) Manter AdminPanelV2 como orquestrador e quebrar em subcomponentes (tabs/sections).
3) Padronizar handling de erro/resposta e autenticação admin.

### Critérios de aceite
- Zero mudança visual/fluxo.
- Arquivo principal reduz drasticamente em complexidade (menos estados e menos fetch inline).

### Rollback
- Refator incremental por aba/feature.

## Fase 5 — Refatorar ActiveWorkout (modularizar finish/offline)
### Problema
Mistura lógica de treino ativo, offline, finish, geração de payload e UI.

### Ações
1) Extrair módulos puros:
   - builder de payload do finish
   - lógica de fila offline
   - lógica de deload e heurísticas
2) Garantir idempotência/segurança do finish (não duplicar treinos).
3) Adicionar testes determinísticos para as partes extraídas.

### Critérios de aceite
- Mesmo comportamento no app.
- Finish offline/online sem duplicações e com fallback confiável.

### Rollback
- Introduzir módulos novos, manter chamadas antigas por 1 ciclo, e migrar uma chamada por vez.

## Fase 6 — Feature flags com lifecycle de verdade
### Problema
Flags sem owner/data e sem remoção viram dívida eterna.

### Ações
1) Formalizar convenção:
   - toda flag tem `owner` + `review_at` + “critério de remoção”.
2) Criar relatório simples (script) listando flags vencidas.
3) Escolher 1 flag madura e remover de ponta a ponta (provar o processo).

### Critérios de aceite
- Existe mecanismo claro para revisão/remoção.
- Pelo menos 1 flag removida com sucesso e sem regressão.

## Fase 7 — Testes (alto ROI + CI local)
### Objetivo
Garantir que os pontos mais caros (VIP, auth, finish/offline, limites) não regressem.

### Ações
1) Expandir `test:smoke` para:
   - entitlements únicos
   - rotas críticas existem
   - ausência de padrões proibidos (duplicação de regras VIP, arquivos “page/route N” etc.)
2) Adicionar um runner unitário (Vitest ou equivalente) só para libs puras:
   - entitlements
   - builder de finish
   - normalizadores
3) (Opcional) Rodar testes SQL/RLS via Supabase local.

### Critérios de aceite
- `npm run build` + `npm run test:smoke` sempre verdes.
- Suite unitária cobre ao menos: entitlements, history enforcement, finish builder.

## Ordem de execução recomendada (por risco/benefício)
1) Entitlements unificados (Fase 1)
2) Enforcement de limites (Fase 2)
3) Testes de alto ROI (Fase 7, em paralelo)
4) Refator AdminPanelV2 (Fase 4)
5) Refator ActiveWorkout (Fase 5)
6) JS→TS progressivo (Fase 3, contínuo conforme refactors)
7) Lifecycle flags (Fase 6)

## Definições para evitar surpresa
- **Sem mudança visual** em AdminPanelV2/ActiveWorkout durante refator.
- **Sem breaking changes** de API: contrato novo vem com fallback por 1 ciclo.
- **Toda mudança** passa por build + smoke antes de avançar de fase.