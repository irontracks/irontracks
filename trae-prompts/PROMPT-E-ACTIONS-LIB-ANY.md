# PROMPT-E — Corrigir `any` em actions/, lib/ e utils/

## Arquivos Alvo

1. `src/actions/workout-actions.ts` — 10 ocorrências
2. `src/actions/admin-actions.ts` — 6 ocorrências
3. `src/lib/offline/idb.ts` — 7 ocorrências
4. `src/lib/telemetry/userActivity.ts` — 4 ocorrências
5. `src/utils/platform.ts` — 5 ocorrências
6. `src/utils/report/buildPeriodReportHtml.ts` — 9 ocorrências

---

## 1. `src/actions/workout-actions.ts`

### Padrão `.catch((): any => null)` (6 ocorrências)

```typescript
// ANTES
const json = await res.json().catch((): any => null)

// DEPOIS
const json = await res.json().catch(() => null) as Record<string, unknown> | null
```

### `Record<string, any>` (3 ocorrências)

```typescript
// ANTES
const body = input && typeof input === 'object' ? (input as Record<string, any>) : {}
const payload = input && typeof input === 'object' ? (input as Record<string, any>) : {}

// DEPOIS
const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
```

### `.map((w: any) =>`, `.map((e: any) =>`, `.map((s: any) =>`

```typescript
// ANTES
workouts: (Array.isArray(workouts) ? workouts : []).map((w: any) => ({
  exercises: (Array.isArray(w?.exercises) ? w.exercises : []).map((e: any) => ({
    sets: (Array.isArray(e?.sets) ? e.sets : []).map((s: any) => ({

// DEPOIS — usar unknown e cast seguro
workouts: (Array.isArray(workouts) ? workouts : []).map((w: unknown) => {
  const workout = w && typeof w === 'object' ? w as Record<string, unknown> : {}
  return {
    // acessar campos via workout.campo
    exercises: (Array.isArray(workout.exercises) ? workout.exercises : []).map((e: unknown) => {
      const ex = e && typeof e === 'object' ? e as Record<string, unknown> : {}
      return {
        // acessar campos via ex.campo
        sets: (Array.isArray(ex.sets) ? ex.sets : []).map((s: unknown) => {
          const set = s && typeof s === 'object' ? s as Record<string, unknown> : {}
          return { /* campos de set */ }
        })
      }
    })
  }
})
```

### `highlights: topByVolume.map((x: any) =>`

```typescript
// ANTES
highlights: topByVolume.map((x: any) => `${safeString(x?.name) || 'Exercício'}: ${Number(x?.volumeKg || 0)}kg`)

// DEPOIS
highlights: topByVolume.map((x: unknown) => {
  const item = x && typeof x === 'object' ? x as Record<string, unknown> : {}
  return `${safeString(item.name) || 'Exercício'}: ${Number(item.volumeKg || 0).toLocaleString('pt-BR')}kg`
})
```

### `insertSetSafe(payload: Record<string, any>)`

```typescript
// ANTES
const insertSetSafe = async (payload: Record<string, any>) => {

// DEPOIS
const insertSetSafe = async (payload: Record<string, unknown>) => {
```

---

## 2. `src/actions/admin-actions.ts`

Mesmo padrão `.catch((): any => null)`:

```typescript
// ANTES (todas as ocorrências)
const json = await res.json().catch((): any => null)

// DEPOIS
const json = await res.json().catch(() => null) as Record<string, unknown> | null
```

---

## 3. `src/lib/offline/idb.ts`

### `.catch((): any => null)` (5 ocorrências)

```typescript
// ANTES
await txDone(tx).catch((): any => null)

// DEPOIS
await txDone(tx).catch(() => undefined)
```

### `.filter((x: any) =>` (2 ocorrências)

```typescript
// ANTES
const next = list.filter((x: any) => String(x?.id || '') !== id)
const next = list.filter((x: any) => String(x?.id || '') !== key)

// DEPOIS
const next = list.filter((x: unknown) => {
  const item = x && typeof x === 'object' ? x as Record<string, unknown> : {}
  return String(item.id || '') !== id
})
```

---

## 4. `src/lib/telemetry/userActivity.ts`

```typescript
// ANTES
metadata?: Record<string, any>
return v as Record<string, any>
export function trackScreen(screen: string, extra?: Record<string, any>)

// DEPOIS
metadata?: Record<string, unknown>
return v as Record<string, unknown>
export function trackScreen(screen: string, extra?: Record<string, unknown>)
```

---

## 5. `src/utils/platform.ts`

O `(cap as any)` é necessário porque `@capacitor/core` não exporta todos os métodos
via TypeScript. Solução: criar uma interface local para o Capacitor:

```typescript
// ANTES
const getPlatform = typeof (cap as any).getPlatform === 'function' ? (cap as any).getPlatform.bind(cap) : null
typeof (cap as any).isNativePlatform === 'function'
typeof (cap as any).isNative === 'boolean'

// DEPOIS — criar interface mínima
interface CapacitorLike {
  getPlatform?: () => string
  isNativePlatform?: () => boolean
  isNative?: boolean
  [key: string]: unknown
}

const capLike = cap as CapacitorLike
const getPlatform = typeof capLike.getPlatform === 'function' ? capLike.getPlatform.bind(capLike) : null
const isNative = typeof capLike.isNativePlatform === 'function'
  ? Boolean(capLike.isNativePlatform())
  : typeof capLike.isNative === 'boolean'
    ? Boolean(capLike.isNative)
    : false
```

---

## 6. `src/utils/report/buildPeriodReportHtml.ts`

### Funções com `any` nos parâmetros

```typescript
// ANTES
const formatDate = (v: any) => {
const formatDateTime = (v: any) => {
const inferRange = (stats: any) => {

// DEPOIS
const formatDate = (v: unknown): string => {
const formatDateTime = (v: unknown): string => {
const inferRange = (stats: unknown): { from: string | null; to: string | null } => {
```

### `.map((s: any) =>`, `.sort((a: any, b: any) =>`, `.filter((x: any) =>`

```typescript
// ANTES
.map((s: any) => { ... })
.sort((a: any, b: any) => { ... })
.filter((x: any) => x != null)

// DEPOIS
.map((s: unknown) => {
  const item = s && typeof s === 'object' ? s as Record<string, unknown> : {}
  // usar item.campo ao invés de s.campo
})
.sort((a: unknown, b: unknown) => {
  const aObj = a && typeof a === 'object' ? a as Record<string, unknown> : {}
  const bObj = b && typeof b === 'object' ? b as Record<string, unknown> : {}
  // comparar aObj.campo vs bObj.campo
})
.filter((x: unknown) => x != null)
```

### `Record<string, any>` (1 ocorrência)

```typescript
// ANTES
const data = input && typeof input === 'object' ? (input as Record<string, any>) : {}

// DEPOIS
const data = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
```

### `topExercisesTable(label: string, rows: any[])`

```typescript
// ANTES
const topExercisesTable = (label: string, rows: any[]) => {

// DEPOIS
interface ExerciseRow {
  name?: string
  volumeKg?: number
  count?: number
  [key: string]: unknown
}
const topExercisesTable = (label: string, rows: ExerciseRow[]) => {
```

---

## Verificação Final

```bash
# Verificar any restantes
grep -c "\bany\b" src/actions/workout-actions.ts
grep -c "\bany\b" src/lib/offline/idb.ts
grep -c "\bany\b" src/lib/telemetry/userActivity.ts
grep -c "\bany\b" src/utils/platform.ts
grep -c "\bany\b" src/utils/report/buildPeriodReportHtml.ts

# Type check
npx tsc --noEmit
```
