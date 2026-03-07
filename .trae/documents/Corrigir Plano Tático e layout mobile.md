## Diagnóstico
### 1) “Plano tático” não funciona
- O gerador `generateAssessmentPlanAi` está devolvendo `plan` como **string** (texto com `\n`).
- A UI do modal/cartão só considera `plan` válido se for **objeto** (`typeof s.plan === 'object'`).
- Resultado: o estado vira `plan = null` e aparece “Nenhum plano disponível.” mesmo existindo conteúdo.
- Pontos do código:
  - Gerador (string): [workout-actions.js:L478-L509](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L478-L509)
  - UI esperando objeto: [AssessmentHistory.tsx:L1441-L1445](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentHistory.tsx#L1441-L1445)

### 2) Botões “bagunçados” no mobile
- No print, o texto do botão/tab “TREINOS” quebra/fragmenta (“TREIN S”).
- A barra de abas usa botões `flex-1` com `uppercase tracking-wider` e **sem** `whitespace-nowrap`; em telas estreitas o texto pode quebrar.
- Trecho: [StudentDashboard.tsx:L215-L251](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx#L215-L251)

## Plano de correção
### A) Consertar “Plano tático” (contrato consistente)
1. Ajustar `generateAssessmentPlanAi` para retornar `plan` no formato que a UI espera:
   - `{ summary: string[], training: string[], nutrition: string[], habits: string[], warnings: string[] }`
   - Migrar o conteúdo do fallback atual para essas listas (ex.: “Treino” vai para `training`, “Recuperação” para `habits`, etc.).
2. Compatibilidade defensiva na UI (para não quebrar nunca mais):
   - Se `res.plan` vier como string (por qualquer motivo), converter para o formato objeto (split por `\n`, mapear bullets) antes de salvar em `aiPlanByAssessmentId`.

### B) Ajustar layout no mobile (abas/botões)
1. Alterar os botões da barra de abas para evitar quebra:
   - Adicionar `whitespace-nowrap` e `leading-none`.
   - Reduzir padding e tracking em telas pequenas (`px-2 sm:px-3`, `tracking-wide sm:tracking-wider`, `text-[11px] sm:text-xs`).
2. Validar com viewport iPhone (Playwright) e confirmar que “TREINOS / AVALIAÇÕES / COMUNIDADE” não quebram.

### C) Validação
- Rodar `npm run lint`.
- Abrir o modal “Plano tático” e confirmar que mostra resumo + seções.
- Abrir dashboard no mobile (viewport pequeno) e confirmar que as abas/botões ficam alinhados.

Vou implementar exatamente isso na sequência.