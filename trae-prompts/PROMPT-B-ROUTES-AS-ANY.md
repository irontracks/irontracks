# PROMPT-B — Corrigir `as any` nas Routes Críticas

## Arquivos Alvo

- `src/app/api/dashboard/bootstrap/route.ts` — 7 ocorrências
- `src/app/api/account/export/route.ts` — 14 ocorrências (mesmo padrão repetido)

---

## 1. Corrigir `src/app/api/dashboard/bootstrap/route.ts`

### Problema

A função `hydrateWorkouts` usa `unknown[]` corretamente, mas dentro faz casts `as any`
para acessar `id`, `workout_id`, `exercise_id`. A solução é criar uma interface mínima
para as rows do banco.

### Substituição Completa da Função `hydrateWorkouts`

Substitua todo o conteúdo da função `hydrateWorkouts` por:

```typescript
interface DbRow {
  id?: string
  workout_id?: string
  exercise_id?: string
  [key: string]: unknown
}

const toDbRow = (v: unknown): DbRow =>
  v && typeof v === 'object' ? (v as DbRow) : {}

const hydrateWorkouts = async (supabase: SupabaseClient, rows: unknown[]) => {
  const base = Array.isArray(rows) ? rows.filter((x) => x && typeof x === 'object') : []
  const workoutIds = base.map((w) => toDbRow(w).id).filter(Boolean) as string[]
  if (!workoutIds.length) return base.map((w) => ({ ...toDbRow(w), exercises: [] }))

  let exercises: DbRow[] = []
  try {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .in('workout_id', workoutIds)
      .order('order', { ascending: true })
      .limit(5000)
    exercises = Array.isArray(data) ? (data as DbRow[]) : []
  } catch {
    exercises = []
  }

  const exerciseIds = exercises.map((e) => e.id).filter(Boolean) as string[]
  let sets: DbRow[] = []
  if (exerciseIds.length) {
    try {
      const { data } = await supabase
        .from('sets')
        .select('*')
        .in('exercise_id', exerciseIds)
        .order('set_number', { ascending: true })
        .limit(20000)
      sets = Array.isArray(data) ? (data as DbRow[]) : []
    } catch {
      sets = []
    }
  }

  const setsByExercise = new Map<string, DbRow[]>()
  for (const s of sets) {
    const eid = s.exercise_id
    if (!eid) continue
    const list = setsByExercise.get(eid) ?? []
    list.push(s)
    setsByExercise.set(eid, list)
  }

  const exByWorkout = new Map<string, DbRow[]>()
  for (const ex of exercises) {
    const wid = ex.workout_id
    if (!wid) continue
    const exWithSets = { ...ex, sets: setsByExercise.get(ex.id ?? '') ?? [] }
    const list = exByWorkout.get(wid) ?? []
    list.push(exWithSets)
    exByWorkout.set(wid, list)
  }

  return base.map((w) => {
    const row = toDbRow(w)
    return { ...row, exercises: exByWorkout.get(row.id ?? '') ?? [] }
  })
}
```

### Também corrigir o catch do GET

```typescript
// ANTES
} catch (e) {
  return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
}

// DEPOIS — usar o utilitário já existente
import { errorResponse } from '@/utils/api'

} catch (e) {
  return errorResponse(e)
}
```

---

## 2. Corrigir `src/app/api/account/export/route.ts`

### Problema

O arquivo tem 14 ocorrências do mesmo padrão repetido:
```typescript
return NextResponse.json({ ok: false, error: (xyzRes.error as any)?.message ?? String(xyzRes.error) }, { status: 500 })
```

### Solução

Adicione o import do utilitário:
```typescript
import { getErrorMessage } from '@/utils/api'
```

Substitua **todas as 14 ocorrências** do padrão:
```typescript
// ANTES
(xyzRes.error as any)?.message ?? String(xyzRes.error)

// DEPOIS
getErrorMessage(xyzRes.error)
```

Exemplo de como fica após a substituição:
```typescript
// ANTES
if (profileRes.ok === false) return NextResponse.json({ ok: false, error: (profileRes.error as any)?.message ?? String(profileRes.error) }, { status: 500 })

// DEPOIS
if (profileRes.ok === false) return NextResponse.json({ ok: false, error: getErrorMessage(profileRes.error) }, { status: 500 })
```

Faça isso para **todas as 14 linhas** que seguem esse padrão no arquivo.

---

## Verificação

```bash
# Confirmar zero 'as any' nos dois arquivos
grep -n "as any" src/app/api/dashboard/bootstrap/route.ts
grep -n "as any" src/app/api/account/export/route.ts

# Type check
npx tsc --noEmit
```
