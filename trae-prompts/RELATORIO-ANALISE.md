# 📊 Relatório de Análise — IronTracks
**Data:** Fevereiro 2026  
**Analisado por:** Claude Sonnet 4.6

---

## Sumário Executivo

O projeto está **bem estruturado e em boa direção** — tem TypeScript, Zod em grande parte
das routes, schemas centrais sendo construídos, padrões de `ActionResult<T>` consistentes.
Mas há problemas residuais da migração JS→TS que precisam ser resolvidos.

---

## ✅ O que está BEM

| Área | Status |
|---|---|
| `src/utils/zod.ts` — `parseJsonBody` e `parseSearchParams` | ✅ Excelente |
| `src/schemas/database.ts` — schemas Zod das entidades DB | ✅ Bem feito |
| `src/schemas/settings.ts` — schema Zod com defaults | ✅ Perfeito |
| `src/types/actions.ts` — `ActionResult<T>` genérico | ✅ Correto |
| `src/hooks/useUserSettings.ts` — tipagem completa | ✅ Correto |
| `src/hooks/useVipCredits.ts` — interface VipCredits | ✅ Correto |
| 73 de 133 routes usando `parseJsonBody` | ✅ Bom progresso |
| `src/lib/finishWorkoutPayload.ts` — sem `any` | ✅ Bem tipado |
| Middleware TypeScript correto | ✅ OK |
| `src/utils/supabase/` — helpers tipados | ✅ OK |

---

## 🔴 Erros Críticos (corrigir agora)

### 1. Arquivos .js duplicados (9 arquivos)
**Impacto:** `allowJs: false` no tsconfig = o bundler pode pegar o .js ou o .ts
dependendo da ordem de resolução. Causa bugs difíceis de rastrear.

| Arquivo JS | Ação |
|---|---|
| `hooks/useUserSettings.js` | Deletar (tem .ts) |
| `hooks/useVipCredits.js` | Deletar (tem .ts) |
| `lib/social/notifyFollowers.js` | Deletar (tem .ts) |
| `utils/calories/kcalClient.js` | Deletar (tem .ts) |
| `utils/report/buildHtml.js` | Deletar (tem .ts) |
| `utils/report/buildPeriodReportHtml.js` | Deletar (tem .ts) |
| `utils/report/templates.js` | Deletar (tem .ts) |
| `components/admin/RequestsTab.js` | Deletar (tem .tsx) |
| `components/admin/AdminVipReports.js` | Deletar (tem .tsx) |

### 2. tsconfig com `strict: false`
**Impacto:** Permite código potencialmente inseguro passar sem erro.
`noImplicitAny: true` com `strict: false` é contraditório.

### 3. `typescript` e `@types/node` ausentes do package.json
**Impacto:** Depende do TypeScript bundlado com o Next.js, o que pode mudar em atualizações.

---

## 🟡 Problemas Importantes (corrigir em breve)

### 4. `any` nos tipos principais

| Arquivo | Ocorrências de `any` | Exemplo |
|---|---|---|
| `types/admin.ts` | 9 | `workouts?: any[]` |
| `types/app.ts` | 1 | `[key: string]: any` em UserRecord |
| `types/social.ts` | 1 | `metadata?: Record<string, any>` |
| `types/assessment.ts` | 1 | `React.ComponentType<any>` |

### 5. `any` em componentes admin

| Arquivo | Ocorrências |
|---|---|
| `components/admin/RequestsTab.tsx` | 3 (useState, handler) |
| `components/admin/AdminVipReports.tsx` | 1 (`supabase: any`) |

### 6. 75 ocorrências de `as any` nas routes de API

Maiores ofensores:
- `api/vip/periodization/create/route.ts` — 16 ocorrências
- `api/account/export/route.ts` — 14 ocorrências
- `api/dashboard/bootstrap/route.ts` — 8 ocorrências

### 7. 58 routes sem validação Zod

Routes GET sem `parseSearchParams` (mesmo tendo query params):
- `api/chat/messages` — `channel_id` capturado manualmente
- `api/exercises/search` — `q` capturado manualmente
- `api/workouts/history` — sem validação de paginação
- `api/admin/students/list` — sem validação de filtros

---

## 🟢 Melhorias Sugeridas

### 8. Criar schemas Zod centrais (faltam)

Atualmente existem apenas `database.ts` e `settings.ts`.
Faltam schemas para:
- Requests de API (`api-requests.ts`)
- Social (`social.ts`)
- Workout (`workout.ts`)
- Admin (`admin.ts`)

### 9. Utilitário `src/utils/api.ts`

Centralizar `errorResponse`, `unauthorizedResponse`, `getErrorMessage`
para evitar o padrão `(e as any)?.message` espalhado em 75 lugares.

### 10. `moduleResolution: "bundler"` no tsconfig

O valor atual `"node"` é desatualizado para Next.js 15+.
`"bundler"` é mais adequado para projetos com Webpack/Turbopack.

### 11. Campos legacy com `@deprecated`

`SetDetail.isWarmup`, `SetDetail.advancedConfig`, `Exercise.restTime`, `Exercise.videoUrl`
são aliases legados que deveriam ser marcados com `@deprecated` para guiar a remoção gradual.

### 12. Remover `void UserSettingsSchema` em `useUserSettings.ts`

Linha desnecessária que não tem efeito prático.

---

## Consistência do App — Avaliação Geral

| Critério | Nota | Observação |
|---|---|---|
| TypeScript Coverage | 8/10 | Quase tudo em TS, poucos .js residuais |
| Zod Validation | 7/10 | 73/133 routes — bom mas incompleto |
| Type Safety | 6/10 | Muitos `any` nos tipos base |
| Schema Centralization | 5/10 | Apenas 2 schemas centrais |
| Error Handling | 6/10 | Inconsistente entre routes |
| Code Organization | 9/10 | Estrutura de pastas excelente |
| **GERAL** | **7/10** | Boa base, precisa de limpeza |

