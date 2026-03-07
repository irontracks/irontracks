## Diagnóstico
- O botão “Insights pós-treino” não funciona porque `generatePostWorkoutInsights` está hardcoded como stub e sempre retorna “IA em manutenção…”.
- A tela do relatório (`WorkoutReport`) está com tema **claro** (`bg-white text-black`) e vários cards brancos.

## Objetivo
- Fazer **Insights pós-treino** gerar conteúdo de verdade (Gemini) e **salvar no histórico**.
- Deixar a tela do relatório **preta/dark** seguindo as cores do app (sem impactar PDF).

## Implementação
### 1) Backend de Insights (Gemini)
- Criar rota `POST /api/ai/post-workout-insights`.
- Usar `@google/generative-ai` com:
  - `GOOGLE_GENERATIVE_AI_API_KEY`
  - `GOOGLE_GENERATIVE_AI_MODEL_ID` (fallback `gemini-2.5-flash`)
- A rota:
  - valida com `requireUser()`
  - carrega o workout no Supabase (via `workoutId` ou `session.id`) e parseia `notes` (JSON da sessão)
  - busca um treino anterior (para comparação) quando disponível
  - gera um JSON puro no formato esperado pelo relatório:
    - `summary: string[]`, `motivation: string`, `highlights: string[]`, `warnings: string[]`,
    - `prs: { exercise, label?, value }[]`,
    - `progression: { exercise, recommendation, reason? }[]`
  - normaliza o resultado (garante arrays/strings) e salva em `workouts.notes.ai`.
  - retorna `{ ok: true, ai, saved: true }`.
- Se faltar chave, retorna erro claro instruindo configurar `GOOGLE_GENERATIVE_AI_API_KEY`.

### 2) Conectar UI ao backend
- Substituir o stub `generatePostWorkoutInsights` em `src/actions/workout-actions.js` para fazer `fetch('/api/ai/post-workout-insights', ...)` e repassar `{ ok, ai, saved, error }`.
- Isso destrava o botão “Gerar” no [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/WorkoutReport.js).

### 3) Deixar a tela do relatório no tema escuro
- Em `WorkoutReport.js`, trocar:
  - wrapper `min-h-screen bg-white text-black` → `min-h-screen bg-neutral-950 text-white`
  - cards `bg-white/border-neutral-200` → `bg-neutral-900 border-neutral-800`
  - textos `text-neutral-900/500` → equivalents dark (`text-neutral-100/300/400`)
  - botões e destaques mantendo o amarelo do app (`text-yellow-500`, `bg-yellow-500`).
- Manter o PDF/print como está, porque ele usa `buildReportHTML` (não depende dessas classes do React).

## Validação
- Abrir relatório → clicar “Gerar” → deve preencher resumo/motivação/destaques.
- Recarregar a página → deve manter e mostrar “Salvo no histórico”.
- Conferir visual dark da tela.
- Rodar lint/build.