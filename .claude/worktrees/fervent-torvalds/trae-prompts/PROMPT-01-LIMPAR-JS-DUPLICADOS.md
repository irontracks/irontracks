# PROMPT-01 — Limpar Arquivos .js Duplicados

## Contexto

O projeto tem `allowJs: false` no tsconfig.json, mas existem arquivos `.js` que coexistem
com versões `.ts` ou `.tsx` dos mesmos módulos. Isso causa:
- Ambiguidade nos imports (bundler pode resolver o .js ao invés do .ts)
- Código morto que pode ser editado por engano
- Confusão na manutenção

## Ação Requerida

**DELETE** os seguintes arquivos .js (mantendo apenas as versões TypeScript):

```
src/hooks/useUserSettings.js          → manter useUserSettings.ts
src/hooks/useVipCredits.js            → manter useVipCredits.ts
src/lib/social/notifyFollowers.js     → manter notifyFollowers.ts
src/utils/calories/kcalClient.js      → manter kcalClient.ts
src/utils/report/buildHtml.js         → manter buildHtml.ts
src/utils/report/buildPeriodReportHtml.js  → manter buildPeriodReportHtml.ts
src/utils/report/templates.js         → manter templates.ts
src/components/admin/RequestsTab.js   → manter RequestsTab.tsx
src/components/admin/AdminVipReports.js → manter AdminVipReports.tsx
```

> ⚠️ NÃO delete `src/app/sw.js` — é o Service Worker e não tem equivalente TS.

## Verificações Após Deletar

1. Rode `tsc --noEmit` — não deve apresentar novos erros
2. Certifique-se que os imports em outros arquivos continuam funcionando:
   - `src/components/AdminPanelV2.tsx` importa `AdminVipReports` e `RequestsTab`
   - `src/components/WorkoutReport.tsx` importa de `buildHtml`, `templates`, `kcalClient`
   - `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` importa de `templates`, `useUserSettings`
   - Routes de API importam de `notifyFollowers`

## Resultado Esperado

Após a limpeza:
- Nenhum arquivo `.js` no projeto (exceto `sw.js`)
- `tsc --noEmit` sem erros relacionados a módulos duplicados
- Imports resolvendo corretamente para as versões TypeScript
