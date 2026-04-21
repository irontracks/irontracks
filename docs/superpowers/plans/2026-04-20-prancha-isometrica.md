# Prancha Isométrica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o modal de série do exercício Prancha em um modal específico com peso corporal auto-preenchido, tempo alvo (substituindo reps) e countdown integrado — reusando a infra de timer de descanso existente.

**Architecture:** Helper `isPlank(name)` detecta o exercício; novo componente `PlankSetInput` renderiza UI alternativa (peso corporal + tempo + botão Iniciar/Parar); coluna `duration_seconds` adicionada em `sets` via migration aditiva nullable; timer existente (`startTimer` + `RestTimerOverlay`) ganha kind `'plank'` com copy condicional e callback `onComplete`.

**Tech Stack:** Next.js 16 + React 19 + TypeScript strict, Vitest (unit), React Testing Library, Playwright (E2E), Supabase (PostgreSQL via MCP), Tailwind v4, Capacitor 8 (iOS/Android hybrid).

**Spec:** [`docs/superpowers/specs/2026-04-20-prancha-isometrica-design.md`](../specs/2026-04-20-prancha-isometrica-design.md)

---

## Task 1: Migration — adicionar coluna `duration_seconds` em `sets`

**Files:**
- Create: `supabase/migrations/<gerado_pelo_MCP>_add_duration_seconds_to_sets.sql`
- Modify: `src/types/supabase.ts` (regenerado pelo MCP)

- [ ] **Step 1: Verificar migrations atuais**

Run: usar tool `mcp__supabase__list_migrations` para listar migrations existentes e confirmar que `duration_seconds` não existe. Anotar a última migration aplicada.

- [ ] **Step 2: Aplicar a migration via MCP**

Usar tool `mcp__supabase__apply_migration` com `name: "add_duration_seconds_to_sets"` e o seguinte SQL:

```sql
ALTER TABLE sets
  ADD COLUMN duration_seconds INTEGER NULL
  CHECK (duration_seconds IS NULL OR duration_seconds > 0);
COMMENT ON COLUMN sets.duration_seconds
  IS 'Duração em segundos para exercícios isométricos (ex: Prancha). NULL para exercícios baseados em reps.';
```

- [ ] **Step 3: Verificar que a migration entrou**

Usar `mcp__supabase__list_migrations` novamente e confirmar que a migration aparece no topo.

- [ ] **Step 4: Regenerar tipos TypeScript**

Usar tool `mcp__supabase__generate_typescript_types` e escrever o conteúdo retornado em `src/types/supabase.ts` (substituindo o arquivo inteiro). Confirmar que a tabela `sets` agora tem `duration_seconds: number | null` no tipo `Row`.

- [ ] **Step 5: Verificar TypeScript ainda compila**

Run: `npx tsc --noEmit`
Expected: zero erros (a coluna nova é opcional, código existente que lê/escreve `sets` não quebra).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ src/types/supabase.ts
git commit -m "feat(db): add duration_seconds column to sets for isometric exercises"
```

---

## Task 2: Atualizar schemas Zod e tipos de app

**Files:**
- Modify: `src/schemas/database.ts:70-93`
- Modify: `src/types/app.ts:26-40`
- Modify: `src/types/workout.ts:5-14`
- Test: `src/schemas/__tests__/database.set.test.ts` (criar)

- [ ] **Step 1: Escrever teste que falha**

Criar `src/schemas/__tests__/database.set.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SetRowSchema } from '../database'

describe('SetRowSchema — duration_seconds', () => {
  const base = {
    id: '00000000-0000-0000-0000-000000000001',
    exercise_id: '00000000-0000-0000-0000-000000000002',
    weight: 82,
    reps: null,
    rpe: null,
    set_number: 1,
    completed: true,
    is_warmup: false,
    advanced_config: null,
  }

  it('aceita duration_seconds como número positivo', () => {
    const parsed = SetRowSchema.parse({ ...base, duration_seconds: 60 })
    expect(parsed.duration_seconds).toBe(60)
  })

  it('aceita duration_seconds como null (exercícios de reps)', () => {
    const parsed = SetRowSchema.parse({ ...base, duration_seconds: null })
    expect(parsed.duration_seconds).toBeNull()
  })

  it('rejeita duration_seconds <= 0', () => {
    expect(() => SetRowSchema.parse({ ...base, duration_seconds: 0 })).toThrow()
    expect(() => SetRowSchema.parse({ ...base, duration_seconds: -5 })).toThrow()
  })

  it('rejeita duration_seconds decimal', () => {
    expect(() => SetRowSchema.parse({ ...base, duration_seconds: 1.5 })).toThrow()
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar que falha**

Run: `npx vitest run src/schemas/__tests__/database.set.test.ts`
Expected: todos os 4 testes falham com erro tipo "Unrecognized key: duration_seconds" ou similar (o schema atual não tem esse campo).

- [ ] **Step 3: Adicionar `duration_seconds` ao `SetRowSchema`**

Em `src/schemas/database.ts`, substituir o bloco do `SetRowSchema` (linhas 70-93):

```ts
export const SetRowSchema = z.object({
  id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  weight: z.number().nullable(),
  reps: z.string().nullable(),
  rpe: z.number().nullable(),
  set_number: z.number().int().default(1),
  completed: z.boolean().default(false),
  is_warmup: z.boolean().nullable(),
  advanced_config: z.unknown().nullable(),
  duration_seconds: z.number().int().positive().nullable(),
})
export const SetSchema = SetRowSchema.transform((row) => ({
  id: row.id,
  exerciseId: row.exercise_id,
  weight: row.weight,
  reps: row.reps,
  rpe: row.rpe,
  setNumber: row.set_number,
  completed: row.completed,
  isWarmup: row.is_warmup,
  advancedConfig: row.advanced_config,
  durationSeconds: row.duration_seconds,
}))
export type SetRow = z.infer<typeof SetRowSchema>
export type Set = z.infer<typeof SetSchema>
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npx vitest run src/schemas/__tests__/database.set.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Adicionar `durationSeconds` ao `SetDetail` (types/app.ts)**

Em `src/types/app.ts`, na interface `SetDetail` (linhas 26-40), adicionar uma linha após `completed?: boolean;`:

```ts
export interface SetDetail {
  set_number: number;
  reps: string | number | null;
  rpe: number | null;
  weight: number | null;
  isWarmup: boolean;
  advancedConfig: AdvancedConfig | AdvancedConfig[] | null;
  completed?: boolean;
  durationSeconds?: number | null;
  it_auto?: {
    source: string;
    kind: string;
    label: string;
    hash: string;
  } | null;
}
```

- [ ] **Step 6: Adicionar `durationSeconds` ao `SetDetailSchema` (types/workout.ts)**

Em `src/types/workout.ts`, substituir `SetDetailSchema` (linhas 5-13):

```ts
export const SetDetailSchema = z.object({
    set_number: z.number().int().min(1),
    reps: z.union([z.string(), z.number()]).nullable().optional(),
    weight: z.number().nullable().optional(),
    rpe: z.number().min(0).max(10).nullable().optional(),
    is_warmup: z.boolean().optional(),
    completed: z.boolean().optional(),
    advanced_config: z.unknown().nullable().optional(),
    duration_seconds: z.number().int().positive().nullable().optional(),
})
```

Também adicionar `durationSeconds` ao tipo `WorkoutSet` (linhas 95-103):

```ts
export interface WorkoutSet {
    setNumber: number
    reps?: string | null
    rpe?: number | null
    weight?: number | null
    isWarmup: boolean
    advancedConfig?: unknown
    completed?: boolean
    durationSeconds?: number | null
}
```

- [ ] **Step 7: Verificar typecheck passa**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 8: Commit**

```bash
git add src/schemas/database.ts src/types/app.ts src/types/workout.ts src/schemas/__tests__/database.set.test.ts
git commit -m "feat(schemas): add duration_seconds/durationSeconds to set types"
```

---

## Task 3: Helper `isPlank` + testes

**Files:**
- Create: `src/utils/exerciseTracking.ts`
- Test: `src/utils/__tests__/exerciseTracking.test.ts`

- [ ] **Step 1: Escrever teste que falha**

Criar `src/utils/__tests__/exerciseTracking.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPlank } from '../exerciseTracking'

describe('isPlank', () => {
  it.each([
    'Prancha',
    'prancha',
    'Prancha lateral',
    'Prancha com toques no ombro',
    'Plank',
    'plank',
    'Side plank',
    'PRANCHA',
  ])('retorna true para %s', (name) => {
    expect(isPlank(name)).toBe(true)
  })

  it.each([
    'Supino',
    'Agachamento',
    'Rosca direta',
    'Bird-dog',
    'Dead bug',
    'Abdominal',
    'Abdominal infra',
    '',
  ])('retorna false para %s', (name) => {
    expect(isPlank(name)).toBe(false)
  })

  it('retorna false para entradas nulas/undefined', () => {
    expect(isPlank(null as unknown as string)).toBe(false)
    expect(isPlank(undefined as unknown as string)).toBe(false)
  })

  it('ignora espaços em branco nas bordas', () => {
    expect(isPlank('  Prancha  ')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar que falha**

Run: `npx vitest run src/utils/__tests__/exerciseTracking.test.ts`
Expected: falha com "Cannot find module '../exerciseTracking'".

- [ ] **Step 3: Implementar `isPlank`**

Criar `src/utils/exerciseTracking.ts`:

```ts
const PLANK_REGEX = /\b(prancha|plank)\b/i

export function isPlank(exerciseName: string | null | undefined): boolean {
  if (!exerciseName || typeof exerciseName !== 'string') return false
  return PLANK_REGEX.test(exerciseName.trim())
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npx vitest run src/utils/__tests__/exerciseTracking.test.ts`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add src/utils/exerciseTracking.ts src/utils/__tests__/exerciseTracking.test.ts
git commit -m "feat(utils): add isPlank helper for isometric exercise detection"
```

---

## Task 4: Helper `formatSetSummary` + testes

**Files:**
- Create: `src/utils/formatSetSummary.ts`
- Test: `src/utils/__tests__/formatSetSummary.test.ts`

- [ ] **Step 1: Escrever teste que falha**

Criar `src/utils/__tests__/formatSetSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatSetSummary } from '../formatSetSummary'

describe('formatSetSummary', () => {
  it('Prancha com duration_seconds novo formato: "60s × 82 kg"', () => {
    const out = formatSetSummary(
      { weight: 82, reps: null, duration_seconds: 60 },
      { name: 'Prancha' },
    )
    expect(out).toBe('60s × 82 kg')
  })

  it('Prancha legado (reps="60", duration_seconds=null): fallback para reps como segundos', () => {
    const out = formatSetSummary(
      { weight: 82, reps: '60', duration_seconds: null },
      { name: 'Prancha' },
    )
    expect(out).toBe('60s × 82 kg')
  })

  it('Prancha sem peso: apenas "60s"', () => {
    const out = formatSetSummary(
      { weight: null, reps: null, duration_seconds: 60 },
      { name: 'Prancha' },
    )
    expect(out).toBe('60s')
  })

  it('Supino (não-prancha): "10 × 80 kg"', () => {
    const out = formatSetSummary(
      { weight: 80, reps: '10', duration_seconds: null },
      { name: 'Supino reto' },
    )
    expect(out).toBe('10 × 80 kg')
  })

  it('Supino sem peso: "10"', () => {
    const out = formatSetSummary(
      { weight: null, reps: '10', duration_seconds: null },
      { name: 'Supino reto' },
    )
    expect(out).toBe('10')
  })

  it('Set vazio retorna string vazia', () => {
    expect(formatSetSummary({ weight: null, reps: null, duration_seconds: null }, { name: 'Supino reto' })).toBe('')
  })
})
```

- [ ] **Step 2: Rodar teste, confirmar que falha**

Run: `npx vitest run src/utils/__tests__/formatSetSummary.test.ts`
Expected: falha com "Cannot find module '../formatSetSummary'".

- [ ] **Step 3: Implementar `formatSetSummary`**

Criar `src/utils/formatSetSummary.ts`:

```ts
import { isPlank } from './exerciseTracking'

type SetLike = {
  weight?: number | null
  reps?: string | number | null
  duration_seconds?: number | null
  durationSeconds?: number | null
}

type ExerciseLike = {
  name?: string | null
}

export function formatSetSummary(set: SetLike, exercise: ExerciseLike): string {
  const name = exercise?.name ?? ''
  const weight = typeof set.weight === 'number' && set.weight > 0 ? set.weight : null
  const weightStr = weight !== null ? ` × ${weight} kg` : ''

  if (isPlank(name)) {
    const duration =
      (typeof set.duration_seconds === 'number' && set.duration_seconds > 0 ? set.duration_seconds : null) ??
      (typeof set.durationSeconds === 'number' && set.durationSeconds > 0 ? set.durationSeconds : null) ??
      (typeof set.reps === 'string' && /^\d+$/.test(set.reps.trim()) ? Number(set.reps) : null) ??
      (typeof set.reps === 'number' && set.reps > 0 ? set.reps : null)
    if (duration === null) return ''
    return `${duration}s${weightStr}`
  }

  const repsNum =
    (typeof set.reps === 'number' && set.reps > 0 ? set.reps : null) ??
    (typeof set.reps === 'string' && set.reps.trim() !== '' ? set.reps.trim() : null)
  if (repsNum === null) return ''
  return `${repsNum}${weightStr}`
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

Run: `npx vitest run src/utils/__tests__/formatSetSummary.test.ts`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add src/utils/formatSetSummary.ts src/utils/__tests__/formatSetSummary.test.ts
git commit -m "feat(utils): add formatSetSummary helper for set rendering"
```

---

## Task 5: Mapear e substituir formatadores "X reps × Y kg" existentes

**Files:**
- Discovered via grep (ver Step 1)

- [ ] **Step 1: Mapear ocorrências de formatação manual de set**

Usar Grep tool:

```
pattern: (\s×\s|\sreps\s?[×x])
output_mode: content
-n: true
```

Também:

```
pattern: \$\{.*reps.*\}.*×.*\$\{.*weight
output_mode: content
-n: true
```

Listar TODOS os arquivos que aparecem. Exemplos esperados (a confirmar): `src/components/workout/SetRenderers.tsx`, `src/utils/report/buildHtml.ts`, componentes de histórico.

Para cada arquivo encontrado:
  - Identificar a função/expressão que monta a string
  - Verificar se está formatando set individual (candidato a usar `formatSetSummary`) ou outro uso incidental (deixar)

- [ ] **Step 2: Para cada ocorrência identificada em Step 1, substituir pelo helper**

Padrão geral:

Antes:
```ts
const summary = `${set.reps} × ${set.weight} kg`
```

Depois:
```ts
import { formatSetSummary } from '@/utils/formatSetSummary'
const summary = formatSetSummary(set, exercise)
```

Onde `exercise` precisa ter pelo menos `{ name }`. Se o código não tiver o exercício em escopo, passar `{ name: '' }` (o helper trata vazio — volta para o caminho não-prancha).

- [ ] **Step 3: Verificar typecheck e lint passam**

Run: `npx tsc --noEmit`
Expected: zero erros.

Run: `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos_editados> --max-warnings 0`
Expected: output vazio.

- [ ] **Step 4: Rodar todos os testes unit**

Run: `npm run test:unit`
Expected: todos passam (os formatadores antigos eram testados implicitamente; o novo helper cobre o comportamento).

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "refactor: replace ad-hoc set summary strings with formatSetSummary"
```

---

## Task 6: Estender `ActiveWorkoutContext.startTimer` com kind `'plank'` + `onComplete`

**Files:**
- Modify: `src/components/workout/ActiveWorkoutContext.tsx`
- Modify: `src/components/workout/RestTimerOverlay.tsx` (copy condicional)

- [ ] **Step 1: Ler `ActiveWorkoutContext.tsx` para entender a assinatura atual de `startTimer`**

Run: ler `src/components/workout/ActiveWorkoutContext.tsx` (arquivo inteiro) e anotar:
- Onde `startTimer` é definido
- O tipo do segundo argumento (`context`)
- Como `context.kind` é hoje tratado

- [ ] **Step 2: Estender o tipo do `context`**

Procurar o tipo que descreve o segundo argumento do `startTimer` (provavelmente uma interface inline ou exportada como `RestTimerContext` ou similar). Adicionar:

```ts
kind?: 'rest' | 'plank'
onComplete?: (finalDurationSeconds?: number) => void
```

Se o tipo hoje é `kind?: string`, pode manter mais permissivo; apenas garantir que o código que checa `kind` reconheça `'plank'`.

- [ ] **Step 3: Ajustar copy do `RestTimerOverlay` para prancha**

Em `src/components/workout/RestTimerOverlay.tsx`, procurar o bloco que renderiza o título do overlay (provavelmente próximo a texto "Descanso" ou usando `context?.exerciseName`).

Adicionar constante no topo do componente, logo após o destructure de props:

```ts
const isPlankMode = context?.kind === 'plank'
const overlayTitle = isPlankMode ? 'Prancha' : 'Descanso'
const finishedLabel = isPlankMode ? 'Tempo concluído!' : 'Descanso concluído!'
```

Substituir o título atual pelo uso de `overlayTitle` e a mensagem de fim pelo `finishedLabel`. Manter qualquer exibição de `context?.exerciseName` como está (ela complementa o título).

- [ ] **Step 4: Chamar `context.onComplete` quando o timer zera**

Procurar no `RestTimerOverlay.tsx` o ponto onde `onFinish` é chamado (quando `timeLeft <= 0`). Adicionar, logo antes ou depois de `onFinish`:

```ts
if (typeof context?.onComplete === 'function') {
  context.onComplete()
}
```

Se `onFinish` já invoca algo no context, deixar ambos — `onComplete` é um hook adicional para o consumidor que iniciou o timer.

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: zero erros.

Run: `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/components/workout/ActiveWorkoutContext.tsx src/components/workout/RestTimerOverlay.tsx --max-warnings 0`
Expected: output vazio.

- [ ] **Step 6: Verificar que o timer de descanso continua funcionando**

Run: `npm run test:unit`
Expected: testes existentes que tocam timer/rest continuam verdes. Se houver teste específico do RestTimerOverlay, ele passa sem ajuste (copy default é "Descanso").

- [ ] **Step 7: Commit**

```bash
git add src/components/workout/ActiveWorkoutContext.tsx src/components/workout/RestTimerOverlay.tsx
git commit -m "feat(timer): support plank kind with onComplete callback"
```

---

## Task 7: Componente `PlankSetInput` + testes

**Files:**
- Create: `src/components/workout/PlankSetInput.tsx`
- Test: `src/components/workout/__tests__/PlankSetInput.test.tsx`
- Modify: `src/hooks/useSettings.ts` ou equivalente (se necessário ler `bodyWeightKg`; ver Step 1)

- [ ] **Step 1: Descobrir como ler `bodyWeightKg` no contexto de workout ativo**

Grep:
```
pattern: bodyWeightKg
glob: src/**/*.ts*
output_mode: content
-n: true
```

Anotar qual hook ou context expõe `bodyWeightKg` (provavelmente `useSettings()` ou similar). Anotar o caminho de link para a tela de perfil (provavelmente `/profile` ou `/perfil` — confirmar via `Glob` em `src/app/**/profile*` e `**/perfil*`).

- [ ] **Step 2: Escrever teste que falha**

Criar `src/components/workout/__tests__/PlankSetInput.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlankSetInput } from '../PlankSetInput'

// Mock do ActiveWorkoutContext
const mockStartTimer = vi.fn()
const mockUpdateLog = vi.fn()

vi.mock('../ActiveWorkoutContext', () => ({
  useActiveWorkout: () => ({
    getLog: () => ({}),
    updateLog: mockUpdateLog,
    startTimer: mockStartTimer,
    getPlannedSet: () => ({ durationSeconds: 60 }),
  }),
}))

// Mock do hook de settings — ajustar path conforme descoberto no Step 1
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ bodyWeightKg: 82 }),
}))

const baseProps = {
  ex: { name: 'Prancha' },
  exIdx: 0,
  setIdx: 0,
}

describe('PlankSetInput', () => {
  beforeEach(() => {
    mockStartTimer.mockReset()
    mockUpdateLog.mockReset()
  })

  it('pré-preenche peso com bodyWeightKg do perfil', () => {
    render(<PlankSetInput {...baseProps} />)
    const weightInput = screen.getByLabelText(/peso corporal/i) as HTMLInputElement
    expect(weightInput.value).toBe('82')
  })

  it('pré-preenche tempo alvo com valor da ficha', () => {
    render(<PlankSetInput {...baseProps} />)
    const timeInput = screen.getByLabelText(/tempo alvo/i) as HTMLInputElement
    expect(timeInput.value).toBe('60')
  })

  it('clicar Iniciar chama startTimer com kind plank e onComplete', () => {
    render(<PlankSetInput {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /iniciar/i }))
    expect(mockStartTimer).toHaveBeenCalledTimes(1)
    const [seconds, ctx] = mockStartTimer.mock.calls[0]
    expect(seconds).toBe(60)
    expect(ctx.kind).toBe('plank')
    expect(typeof ctx.onComplete).toBe('function')
  })
})

describe('PlankSetInput — sem peso cadastrado', () => {
  beforeEach(() => {
    vi.doMock('@/hooks/useSettings', () => ({
      useSettings: () => ({ bodyWeightKg: null }),
    }))
  })

  it('mostra mensagem pedindo para cadastrar peso no perfil', async () => {
    vi.resetModules()
    const { PlankSetInput: Fresh } = await import('../PlankSetInput')
    render(<Fresh {...baseProps} />)
    expect(screen.getByText(/cadastre seu peso no perfil/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Rodar teste, confirmar que falha**

Run: `npx vitest run src/components/workout/__tests__/PlankSetInput.test.tsx`
Expected: falha com "Cannot find module '../PlankSetInput'".

- [ ] **Step 4: Implementar `PlankSetInput`**

Criar `src/components/workout/PlankSetInput.tsx`:

```tsx
import React, { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Play, Square } from 'lucide-react'
import { useActiveWorkout } from './ActiveWorkoutContext'
import { useSettings } from '@/hooks/useSettings' // ajustar se o path descoberto for diferente
import { UnknownRecord } from './types'

type Props = {
  ex: UnknownRecord
  exIdx: number
  setIdx: number
}

export const PlankSetInput: React.FC<Props> = ({ ex, exIdx, setIdx }) => {
  const { getLog, updateLog, startTimer, getPlannedSet } = useActiveWorkout()
  const { bodyWeightKg } = useSettings()

  const key = `${exIdx}-${setIdx}`
  const log = getLog(key)
  const plannedSet = getPlannedSet(ex, setIdx) as { durationSeconds?: number | null } | null

  const initialWeight =
    typeof log.weight === 'number' || typeof log.weight === 'string'
      ? String(log.weight)
      : bodyWeightKg != null
        ? String(bodyWeightKg)
        : ''
  const initialDuration =
    log.durationSeconds != null
      ? String(log.durationSeconds)
      : plannedSet?.durationSeconds != null
        ? String(plannedSet.durationSeconds)
        : ''

  const [weight, setWeight] = useState(initialWeight)
  const [targetSeconds, setTargetSeconds] = useState(initialDuration)
  const [isRunning, setIsRunning] = useState(false)
  const startedAtRef = useRef<number>(0)

  const inputBase =
    'w-full bg-black/40 border border-neutral-700/80 rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 ring-yellow-500 focus:border-yellow-500/50'

  const handleStart = useCallback(() => {
    const sec = Number(targetSeconds)
    if (!Number.isFinite(sec) || sec <= 0) return
    startedAtRef.current = Date.now()
    setIsRunning(true)

    startTimer(sec, {
      kind: 'plank',
      key,
      exerciseName: String(ex?.name || '').trim(),
      onComplete: () => {
        // Timer zerou: salva a série com duration_seconds = meta (tempo alvo)
        updateLog(key, {
          weight: weight === '' ? null : Number(weight),
          reps: null,
          durationSeconds: sec,
          done: true,
        })
        setIsRunning(false)
      },
    })
  }, [targetSeconds, startTimer, key, ex?.name, updateLog, weight])

  const handleStop = useCallback(() => {
    // Usuário parou antes do fim: salva com duration_seconds = tempo decorrido real
    const elapsedMs = Date.now() - startedAtRef.current
    const aguentou = Math.max(1, Math.round(elapsedMs / 1000))
    updateLog(key, {
      weight: weight === '' ? null : Number(weight),
      reps: null,
      durationSeconds: aguentou,
      done: true,
    })
    setIsRunning(false)
    // cancelar o timer ativo — depende de API existente do context; se houver `cancelTimer()` usar aqui
  }, [key, updateLog, weight])

  const secondsNum = Number(targetSeconds)
  const canStart = Number.isFinite(secondsNum) && secondsNum > 0

  if (isRunning) {
    // Estado simplificado enquanto timer rola — o visual principal fica por conta do RestTimerOverlay
    return (
      <div className="rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">Série {setIdx + 1} • Prancha em andamento</span>
          <button
            type="button"
            onClick={handleStop}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/90 text-white text-xs font-black"
          >
            <Square size={14} />
            Parar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border px-3 py-2.5 bg-neutral-900/50 border-neutral-800/80 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] bg-yellow-500 text-black">
          {setIdx + 1}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-1.5 min-w-0">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5">
              Peso corporal (kg)
            </label>
            <input
              aria-label="Peso corporal em kg"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={inputBase}
              placeholder="kg"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold block mb-0.5">
              Tempo alvo (s)
            </label>
            <input
              aria-label="Tempo alvo em segundos"
              inputMode="numeric"
              value={targetSeconds}
              onChange={(e) => setTargetSeconds(e.target.value)}
              className={inputBase}
              placeholder="seg"
            />
          </div>
        </div>
      </div>

      {bodyWeightKg == null && (
        <p className="text-[11px] text-amber-400/80 px-1">
          Cadastre seu peso no{' '}
          <Link href="/perfil" className="underline hover:text-amber-300">
            perfil
          </Link>{' '}
          para auto-preenchimento.
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-sm bg-yellow-500 text-black disabled:bg-neutral-800 disabled:text-neutral-600 transition-all duration-200"
      >
        <Play size={16} />
        Iniciar {canStart ? `(${secondsNum}s)` : ''}
      </button>
    </div>
  )
}
```

**Observação para o executor:** se `useSettings` não existir com esse nome, descobrir o hook real no Step 1 e ajustar o import. Se o link do perfil não for `/perfil`, usar o caminho real descoberto.

- [ ] **Step 5: Rodar teste, confirmar que passa**

Run: `npx vitest run src/components/workout/__tests__/PlankSetInput.test.tsx`
Expected: todos passam.

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit`
Run: `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/components/workout/PlankSetInput.tsx --max-warnings 0`
Expected: ambos limpos.

- [ ] **Step 7: Commit**

```bash
git add src/components/workout/PlankSetInput.tsx src/components/workout/__tests__/PlankSetInput.test.tsx
git commit -m "feat(workout): add PlankSetInput component with integrated countdown"
```

---

## Task 8: Integrar `PlankSetInput` em `SetInputRow`

**Files:**
- Modify: `src/components/workout/SetInputRow.tsx`

- [ ] **Step 1: Modificar o componente para delegar em prancha**

Em `src/components/workout/SetInputRow.tsx`, logo após os imports existentes, adicionar:

```ts
import { isPlank } from '@/utils/exerciseTracking'
import { PlankSetInput } from './PlankSetInput'
```

E logo depois da linha `export const SetInputRow: React.FC<Props> = ({ ex, exIdx, setIdx }) => {` e do destructure do `useActiveWorkout`, adicionar antes de qualquer outra lógica:

```ts
const exerciseName = String(ex?.name ?? '')
if (isPlank(exerciseName)) {
  return <PlankSetInput ex={ex} exIdx={exIdx} setIdx={setIdx} />
}
```

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npx tsc --noEmit`
Run: `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/components/workout/SetInputRow.tsx --max-warnings 0`
Expected: ambos limpos.

- [ ] **Step 3: Verificar que exercícios não-prancha continuam iguais**

Run: `npm run test:unit`
Expected: todos os testes existentes continuam verdes.

- [ ] **Step 4: Commit**

```bash
git add src/components/workout/SetInputRow.tsx
git commit -m "feat(workout): delegate to PlankSetInput when exercise is plank"
```

---

## Task 9: Atualizar `SetDetailsSection` (editor de ficha) para prancha

**Files:**
- Modify: `src/components/ExerciseEditor/SetDetailsSection.tsx`

- [ ] **Step 1: Ler `SetDetailsSection.tsx` e identificar o bloco dos inputs**

Ler o arquivo inteiro (251 linhas). Localizar o bloco que renderiza os labels "Carga (kg)" / "Reps" / "RPE" (referido no spec como linhas 79-115).

- [ ] **Step 2: Importar `isPlank` e tornar o bloco condicional**

No topo do arquivo, adicionar:

```ts
import { isPlank } from '@/utils/exerciseTracking'
```

Antes do JSX que renderiza os três inputs, adicionar:

```ts
const exerciseName = String((exercise as { name?: string })?.name ?? '')
const isIsoPlank = isPlank(exerciseName)
```

(O nome da prop que carrega o exercício no componente é `exercise` ou equivalente — confirmar ao ler.)

No bloco do input "Reps", trocar:

```tsx
<label>Reps</label>
<input ... value={setDetail.reps ?? ''} onChange={...} />
```

Por:

```tsx
<label>{isIsoPlank ? 'Tempo alvo (s)' : 'Reps'}</label>
<input
  inputMode={isIsoPlank ? 'numeric' : 'decimal'}
  aria-label={isIsoPlank ? 'Tempo alvo em segundos' : 'Repetições'}
  value={isIsoPlank ? String(setDetail.durationSeconds ?? '') : String(setDetail.reps ?? '')}
  onChange={(e) => {
    const v = e.target.value
    if (isIsoPlank) {
      onChange({ ...setDetail, durationSeconds: v === '' ? null : Number(v), reps: null })
    } else {
      onChange({ ...setDetail, reps: v })
    }
  }}
/>
```

(Ajustar nomes de callbacks/handlers para os reais no arquivo. Os principais pontos: quando `isIsoPlank`, grava `durationSeconds` e zera `reps`; caso contrário, grava `reps` normal.)

No bloco do label "Carga (kg)", trocar apenas o texto do label quando `isIsoPlank`:

```tsx
<label>{isIsoPlank ? 'Peso corporal (kg)' : 'Carga (kg)'}</label>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Run: `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs src/components/ExerciseEditor/SetDetailsSection.tsx --max-warnings 0`
Expected: ambos limpos.

- [ ] **Step 4: Verificar testes unit**

Run: `npm run test:unit`
Expected: todos verdes. Se houver teste específico para `SetDetailsSection`, verificar que o caminho não-prancha continua funcionando.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExerciseEditor/SetDetailsSection.tsx
git commit -m "feat(editor): replace reps with duration for plank in set template"
```

---

## Task 10: Teste E2E (Playwright)

**Files:**
- Create: `e2e/plank-set.spec.ts`

- [ ] **Step 1: Ler um E2E existente como referência**

Glob: `e2e/*.spec.ts`. Abrir um arquivo curto (ex: `e2e/smoke.spec.ts` se existir) para ver como autenticação é mockada, como o usuário entra numa ficha, etc.

- [ ] **Step 2: Escrever o spec**

Criar `e2e/plank-set.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Prancha isométrica', () => {
  test('usuário registra série de prancha via timer countdown', async ({ page }) => {
    // Fazer login/seed como os outros E2E fazem (ajustar conforme padrão do projeto)
    await page.goto('/')
    // ... autenticação conforme padrão existente

    // Assumindo que existe uma ficha com Prancha 3x60s ou que o usuário cria uma
    await page.goto('/treino/novo')
    await page.fill('[aria-label="Nome do treino"]', 'Teste Prancha')
    // Adicionar exercício Prancha
    await page.click('button:has-text("Adicionar exercício")')
    await page.fill('[aria-label="Buscar exercício"]', 'Prancha')
    await page.click('text=Prancha')

    // Iniciar treino
    await page.click('button:has-text("Iniciar treino")')

    // Verificar que o modal da série mostra "Peso corporal" e "Tempo alvo"
    await expect(page.getByLabel('Peso corporal em kg')).toBeVisible()
    await expect(page.getByLabel('Tempo alvo em segundos')).toBeVisible()

    // Ajustar tempo alvo para 5s (para o teste ser rápido)
    await page.fill('[aria-label="Tempo alvo em segundos"]', '5')

    // Iniciar
    await page.click('button:has-text("Iniciar")')

    // Aguardar o overlay do countdown aparecer
    await expect(page.locator('text=Prancha em andamento')).toBeVisible()

    // Aguardar o timer terminar (5s + pequena margem)
    await page.waitForTimeout(6000)

    // Verificar que a série foi marcada como concluída
    await expect(page.locator('text=/5s\\s*×/')).toBeVisible()
  })
})
```

**Nota para o executor:** ajustar seletores, rotas e fluxo de autenticação conforme o padrão dos outros E2E do projeto. O ponto crítico é: abrir ficha de Prancha, rodar um countdown curto (5s), verificar que resultou em série concluída com `5s × ...`.

- [ ] **Step 3: Rodar o E2E**

Run: `npm run e2e -- e2e/plank-set.spec.ts`
Expected: o teste passa. Se ele falhar por problemas de seletor/fluxo específicos do app, o executor ajusta iterativamente (máximo 3 tentativas — se não rodar, marcar o teste como `.fixme` e documentar no commit).

- [ ] **Step 4: Commit**

```bash
git add e2e/plank-set.spec.ts
git commit -m "test(e2e): register plank set via integrated countdown"
```

---

## Task 11: Quality gates finais e preparação para deploy

**Files:** (nenhum novo; só verificação)

- [ ] **Step 1: TypeScript**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 2: ESLint (projeto inteiro)**

Run: `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs --max-warnings 0`
Expected: output vazio.

- [ ] **Step 3: Testes unit completos**

Run: `npm run test:unit`
Expected: todos passam.

- [ ] **Step 4: Smoke tests**

Run: `npm run test:smoke`
Expected: todos os 13 smoke tests passam.

- [ ] **Step 5: Scan de secrets (padrão do projeto)**

Run: `npm run scan:secrets`
Expected: nenhum secret leakado (não tocamos em env, mas é padrão).

- [ ] **Step 6: Build local**

Run: `npm run build`
Expected: build completa sem erros e sem warnings.

- [ ] **Step 7: (opcional) Capacitor sync**

Run: `npm run cap:sync`
Expected: sync ok. Só rodar se houver plano de testar em device nativo — nenhuma mudança nativa neste plano.

- [ ] **Step 8: Criar PR para main**

```bash
git push -u origin <branch-atual>
gh pr create --title "feat: Prancha como exercício isométrico com timer integrado" --body "$(cat <<'EOF'
## Summary
- Modal de série da Prancha agora exibe campo "Tempo alvo (s)" em vez de reps
- Peso corporal auto-preenche via `settings.bodyWeightKg` do perfil
- Timer countdown integrado (reusa infra do RestTimerOverlay) com som/vibração/notificação nativa e suporte a background
- Nova coluna `duration_seconds` em `sets` (migration aditiva nullable — sem breaking change)

## Test plan
- [ ] TypeScript sem erros (`npx tsc --noEmit`)
- [ ] ESLint sem warnings
- [ ] Testes unitários todos verdes
- [ ] Smoke tests verdes
- [ ] E2E plank-set passa
- [ ] Manual: exercício não-prancha (Supino) continua igual

Ref: `docs/superpowers/specs/2026-04-20-prancha-isometrica-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR criada com sucesso. Não merjar direto — aguardar revisão humana.

---

## Rollback plan (para referência)

Se algo der errado em produção:

```sql
ALTER TABLE sets DROP COLUMN duration_seconds;
```

E reverter o PR. Sets criados com `duration_seconds` perdem o tempo, mas nenhum outro registro é afetado. Sets antigos de Prancha (com tempo em `reps`) continuam íntegros independentemente deste rollback.
