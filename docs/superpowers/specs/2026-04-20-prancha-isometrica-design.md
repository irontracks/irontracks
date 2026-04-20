# Design: Prancha como exercício isométrico com timer integrado

**Data:** 2026-04-20
**Autor:** Maicon + Claude (brainstorming)
**Escopo:** Somente o exercício Prancha (e variações detectáveis por nome). Outros isométricos ficam fora.

---

## 1. Problema

Hoje, o exercício Prancha usa o mesmo esquema de qualquer outro exercício: os campos são `peso` e `reps`. Isso gera três problemas:

1. **Peso**: o usuário tem que digitar o peso corporal a cada série — devia ser auto-preenchido do perfil.
2. **Reps e tempo misturados**: hoje o usuário digita "60" na caixa de reps e entende como 60 segundos — mas o campo é textual e inconsistente.
3. **Timer externo**: não existe contagem de tempo no app; o usuário usa cronômetro do celular à parte.

## 2. Escopo e não-escopo

**Dentro do escopo:**
- Prancha, Prancha lateral, Prancha com toques no ombro (e qualquer outro exercício cujo nome contenha "prancha" ou "plank").
- Campo peso auto-preenchido com `settings.bodyWeightKg`.
- Campo de tempo alvo (segundos) substitui o campo de reps.
- Timer countdown integrado no modal, reutilizando a infra de timer de descanso.
- Tempo alvo configurável tanto na ficha quanto no modal de série (híbrido).

**Fora do escopo:**
- Outros exercícios isométricos (Bird-dog, Dead bug, Wall sit, Dead hang).
- Taxonomia genérica de "tipo de tracking" (tempo, reps, distância, etc.).
- Migração de sets antigos de Prancha que usaram `reps` como segundos — ficam como estão e são lidos via fallback.

## 3. Decisões-chave

| Decisão | Escolha |
|---|---|
| Escopo | Só Prancha (hardcoded via helper `isPlank`) |
| Modo do timer | Countdown com meta (usuário define o tempo alvo) |
| Peso corporal | Auto-preenche com `settings.bodyWeightKg`, editável |
| Tempo alvo | Configurável na ficha + sobrescrever no modal (híbrido) |
| Storage | Coluna nova `duration_seconds` em `sets` |
| Timer | Reutiliza `WorkoutTimerContext` + `RestTimerOverlay` com novo modo `'plank'` |
| Botão Cancelar | Não existe — se começou, conta (honesto) |
| Peso sem cadastro | Mensagem inline com link para perfil; permite iniciar sem peso |

## 4. Arquitetura

Helper único `isPlank(exerciseName: string): boolean` em `src/utils/exerciseTracking.ts` centraliza a detecção (regex `/\bprancha\b|\bplank\b/i`). Todos os pontos que hoje mostram reps/peso consultam esse helper e renderizam condicionalmente.

**Arquivos novos:**
- `src/utils/exerciseTracking.ts` — helper `isPlank`
- `src/components/workout/PlankSetInput.tsx` — substitui `SetInputRow` quando é prancha
- `src/utils/formatSetSummary.ts` — centraliza formatação de série no histórico
- `supabase/migrations/<TIMESTAMP>_add_duration_seconds_to_sets.sql` (timestamp gerado no momento da criação da migration via Supabase MCP)
- `src/utils/__tests__/exerciseTracking.test.ts`
- `src/utils/__tests__/formatSetSummary.test.ts`
- `src/components/workout/__tests__/PlankSetInput.test.tsx`
- `e2e/plank-set.spec.ts`

**Arquivos modificados:**
- `src/schemas/database.ts` (SetRowSchema) — adiciona `duration_seconds`
- `src/types/app.ts` (SetDetail) — adiciona `durationSeconds`
- `src/types/workout.ts` (SetDetailSchema) — adiciona `durationSeconds`
- `src/types/supabase.ts` — regerado via MCP Supabase após a migration
- `src/components/workout/SetInputRow.tsx` — delega para `PlankSetInput` se `isPlank`
- `src/components/ExerciseEditor/SetDetailsSection.tsx` — troca "Reps" por "Tempo alvo (s)" se `isPlank`
- `src/components/workout/WorkoutTimerContext.tsx` — estado ganha campo `mode: 'rest' | 'plank'`
- `src/components/workout/RestTimerOverlay.tsx` — ajusta copy/título conforme `mode` (renomear pra `WorkoutTimerOverlay.tsx` na mesma PR)
- Todos os locais que hoje montam string "X reps × Y kg" passam a usar `formatSetSummary`. Durante implementação, o plano vai mapear cada ocorrência via `grep` e listá-las explicitamente.

**Princípio de isolamento:** `PlankSetInput` é um componente fechado — recebe props (exercício, série atual, peso corporal do usuário, callback de salvar), gerencia timer internamente, retorna `{ weight, duration_seconds }`. Pode ser testado em isolamento, e o `SetInputRow` não precisa saber nada sobre timer ou tempo.

## 5. Schema e banco de dados

### Migration

```sql
ALTER TABLE sets
  ADD COLUMN duration_seconds INTEGER NULL
  CHECK (duration_seconds IS NULL OR duration_seconds > 0);
COMMENT ON COLUMN sets.duration_seconds
  IS 'Duração em segundos para exercícios isométricos (ex: Prancha). NULL para exercícios baseados em reps.';
```

Aditiva e nullable — sem downtime, sem quebrar sets existentes.

### Schemas Zod

`SetRowSchema` (`src/schemas/database.ts`):
```ts
duration_seconds: z.number().int().positive().nullable()
```

`SetDetail` (`src/types/app.ts`) e `SetDetailSchema` (`src/types/workout.ts`):
```ts
durationSeconds: number | null
```

### Invariante (no código, não no banco)

Se `isPlank(exercise.name) === true`, a série gravada tem `duration_seconds != null` e `reps == null`. Caso contrário, `duration_seconds == null` e `reps != null`. Essa regra vive dentro do `PlankSetInput` (nunca grava reps) e `SetInputRow` (nunca grava duration).

### Sem backfill

Sets antigos de Prancha (com tempo em `reps`) continuam como estão. O `formatSetSummary` faz fallback:
```ts
if (isPlank(ex.name)) {
  const sec = set.duration_seconds ?? Number(set.reps ?? 0);
  return `${sec}s × ${set.weight}kg`;
}
```

## 6. UI

### 6.1 — `PlankSetInput` (modal de série)

**Estado padrão:**

```
┌──────────────────────────────────────────────────┐
│ Série 1                                          │
│                                                  │
│ Peso corporal (kg)     Tempo alvo (s)            │
│ [ 82     ]             [ 60     ]                │
│                                                  │
│        [  ▶ Iniciar (60s)  ]                     │
└──────────────────────────────────────────────────┘
```

**Durante countdown:**

```
┌──────────────────────────────────────────────────┐
│ Série 1 • Prancha em andamento                   │
│                                                  │
│              00:43                               │
│         ⸺⸺⸺⸺⸺⸺⸺ 72%                             │
│                                                  │
│        [  ⏹ Parar  ]                             │
└──────────────────────────────────────────────────┘
```

**Comportamento:**

- Ao montar: `weight` pré-preenche com `settings.bodyWeightKg`. Se for `null`, campo fica vazio com mensagem inline: *"Cadastre seu peso no [perfil](link) para auto-preenchimento"*. O usuário pode prosseguir mesmo sem peso (salva `weight = null`).
- `duration_seconds` pré-preenche com valor configurado na ficha (template) via `SetDetailsSection`. Se a template não define (ex: Prancha adicionada sem ajuste), campo fica vazio e o usuário digita.
- Clicar **Iniciar**: inicia countdown via `WorkoutTimerContext.startTimer({ seconds: meta, mode: 'plank', onComplete })`. Desabilita edição dos campos durante a série. Dispara `haptics.impact('light')`.
- **Timer zera**: salva série com `duration_seconds = meta`, `weight = valor do input`, `reps = null`, `completed = true`. Dispara som + vibração + notificação nativa (herdado do timer de descanso).
- Clicar **Parar antes**: salva série com `duration_seconds = metaSeconds - remainingSeconds` (tempo efetivamente aguentado), `completed = true`. Sem flag de "falhou" — registra o que aguentou, de forma honesta.
- **Sem botão Cancelar**: se começou, conta.

### 6.2 — `SetDetailsSection` (editor de ficha/template)

Quando `isPlank(exercise.name)`:
- Campo "Carga (kg)" → label muda para "Peso corporal (kg)" com hint "Auto-preenchido no treino"
- Campo "Reps" → substituído por "Tempo alvo (s)"
- Campo "RPE" → mantém

Usuário monta a ficha como "Prancha 3 séries × 60s".

### 6.3 — Histórico / visualização

Helper `formatSetSummary(set, exercise)` centraliza a formatação. Qualquer local que hoje monta "X reps × Y kg" passa a usar o helper — fica na mesma PR.

- Prancha com `duration_seconds != null` → `"60s × 82 kg"`
- Prancha legado (sem `duration_seconds`, `reps = "60"`) → `"60s × 82 kg"` (via fallback)
- Outros exercícios → comportamento atual (`"10 × 80 kg"`)

## 7. Timer (reuso da infra existente)

**Não criar `ExecutionTimerOverlay` novo.** O `WorkoutTimerContext` + `RestTimerOverlay` já fazem countdown, som, vibração, notificação nativa via Capacitor e background task (tela trancada). A diferença é só semântica.

**Mudanças:**
- `WorkoutTimerContext`: estado ganha `mode: 'rest' | 'plank'` e `onComplete?: () => void`.
- `RestTimerOverlay` (renomear para `WorkoutTimerOverlay.tsx`): copy do título muda conforme `mode` ("Descanso" vs "Prancha").
- Som, vibração, notificação, comportamento em background — tudo compartilhado.

**Fluxo:**
1. `PlankSetInput` → `startTimer({ seconds: meta, mode: 'plank', onComplete: () => saveSet(...) })`
2. `WorkoutTimerContext` inicia countdown idêntico ao rest.
3. `WorkoutTimerOverlay` ajusta título conforme `mode`.
4. Ao zerar: dispara `onComplete` (salva série) + som/vibração/notificação existentes.
5. Em background (app minimizado ou tela trancada): timer continua e alerta via notificação local.

**Por que não criar overlay novo:** duplicaria lógica crítica de timing em iOS/Android, que historicamente é sensível. Menos arquivos, menos duplicação.

## 8. Testes

### Unitários (Vitest)

`src/utils/__tests__/exerciseTracking.test.ts`:
- `isPlank("Prancha")` → `true`
- `isPlank("Prancha lateral")` → `true`
- `isPlank("Plank")` → `true`
- `isPlank("Supino")` → `false`
- `isPlank("")` → `false`
- `isPlank(null as any)` → `false`

`src/utils/__tests__/formatSetSummary.test.ts`:
- Prancha com `duration_seconds=60, weight=82` → `"60s × 82 kg"`
- Prancha legado (sem `duration_seconds`, `reps="60"`) → `"60s × 82 kg"`
- Supino com `reps="10", weight=80` → `"10 × 80 kg"` (não regride)

### Componente (Vitest + Testing Library)

`src/components/workout/__tests__/PlankSetInput.test.tsx` (mocka `WorkoutTimerContext`):
- Renderiza peso vazio + mensagem quando `bodyWeightKg` é null
- Renderiza peso preenchido quando cadastrado
- Clicar Iniciar chama `startTimer({seconds, mode:'plank', onComplete})`
- Clicar Parar durante timer salva série com tempo decorrido real
- `onComplete` (disparado pelo context ao zerar) salva série com tempo alvo

### E2E (Playwright)

`e2e/plank-set.spec.ts`:
- Usuário com peso cadastrado entra em ficha contendo Prancha → inicia série → timer conta → zera → histórico mostra "60s × Xkg"

### Regressão manual (não-automatizada)

Antes de merge: exercício não-prancha (ex: Supino) continua exatamente igual — modal com reps/peso, sem campos novos aparecendo.

## 9. Checklist de deploy

1. Aplicar migration em branch Supabase (MCP `apply_migration`) — verificar em `list_migrations`
2. `mcp__supabase__generate_typescript_types` → atualiza `src/types/supabase.ts`
3. `npx tsc --noEmit` → zero erros
4. ESLint nos arquivos editados com `--max-warnings 0`
5. `npm run test:unit` → tudo passando
6. `npm run scan:secrets` (padrão)
7. `npm run build` local → sucesso
8. Merge via PR (não direto em main) → Vercel CI/CD faz deploy web
9. `npm run cap:sync` apenas se for rodar em device local — nenhuma mudança nativa neste spec

## 10. Rollback

Migration aditiva e nullable → rollback:
```sql
ALTER TABLE sets DROP COLUMN duration_seconds;
```
+ revert do PR.

Sets criados com `duration_seconds` perdem o tempo (não caem para `reps`), mas nenhum outro registro quebra e nenhum dado antigo é afetado.
