# 🤖 TRAE — Prompts v2 (Continuação)

## ✅ O que foi feito na rodada anterior

| Item | Status |
|---|---|
| Arquivos `.js` duplicados removidos | ✅ Feito (restou só `sw.js` + `generatePdf.js`) |
| `tsconfig.json` corrigido (`strict: true`, `moduleResolution: bundler`) | ✅ Feito |
| `typescript` e `@types/node` adicionados ao package.json | ✅ Feito |
| `types/admin.ts` — zero `any` | ✅ Feito |
| `types/app.ts` — zero `any` | ✅ Feito |
| `types/social.ts` — zero `any` | ✅ Feito |
| `components/admin/` — zero `any` | ✅ Feito |
| `src/utils/api.ts` criado | ✅ Feito |
| Schemas centrais criados (`admin`, `workout`, `social`, `api-requests`) | ✅ Feito |
| `@deprecated` nos campos legados de `types/app.ts` | ✅ Feito |
| `void UserSettingsSchema` removido | ✅ Feito |

---

## ❌ O que ainda falta (esta rodada)

| Arquivo | Prioridade | Prompt |
|---|---|---|
| `generatePdf.js` ainda existe (tem `.ts` com `any`) | 🔴 CRÍTICO | PROMPT-A |
| `account/export/route.ts` — 14 `as any` (mesmo padrão em todo arquivo) | 🔴 CRÍTICO | PROMPT-B |
| `dashboard/bootstrap/route.ts` — 7 `as any` + tipos soltos | 🔴 CRÍTICO | PROMPT-B |
| `HistoryList.tsx` — 30+ `any` (arquivo de 1593 linhas) | 🟡 IMPORTANTE | PROMPT-C |
| `VipHub.tsx` — 12 `any` (props e handlers) | 🟡 IMPORTANTE | PROMPT-C |
| `CoachChatModal.tsx`, `ChatListScreen.tsx`, `InviteManager.tsx` | 🟡 IMPORTANTE | PROMPT-C |
| 54 routes ainda sem Zod (majoritariamente GET sem params) | 🟢 MELHORIA | PROMPT-D |
| `actions/` — 16 `any` | 🟢 MELHORIA | PROMPT-E |
| `lib/` — 32 `any` | 🟢 MELHORIA | PROMPT-E |

---

## 📋 Ordem de Execução

```
PROMPT-A-GENERATEPDF.md          → Rápido, 1 arquivo
PROMPT-B-ROUTES-AS-ANY.md        → Medium, 2 routes críticas
PROMPT-C-COMPONENTS-ANY.md       → Maior esforço, 5 components
PROMPT-D-ROUTES-SEM-ZOD.md       → GET-only routes (muitas são triviais)
PROMPT-E-ACTIONS-LIB-ANY.md      → actions/ e lib/
```

Após cada prompt: `npx tsc --noEmit`
