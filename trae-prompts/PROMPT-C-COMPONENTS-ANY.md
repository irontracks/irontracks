# PROMPT-C — Corrigir `any` nos Componentes Principais

## Arquivos Alvo (em ordem de prioridade)

1. `src/components/VipHub.tsx` — 12 ocorrências
2. `src/components/ChatListScreen.tsx` — 3 ocorrências
3. `src/components/IncomingInviteModal.tsx` — 1 ocorrência
4. `src/components/CoachChatModal.tsx` — 4 ocorrências
5. `src/components/HistoryList.tsx` — 30+ ocorrências (o mais complexo)

---

## 1. Corrigir `src/components/VipHub.tsx`

### Props com `any`

```typescript
// ANTES
interface VipHubProps {
  onOpenWorkoutEditor?: (workout?: any) => void
  onStartSession?: (workout: any) => void
  onOpenReport?: (s?: any) => void
}

interface ChatMessage {
  dataUsed?: any[]
  followUps?: any[]
  actions?: any[]
}
```

```typescript
// DEPOIS — importar Workout de types/app
import type { Workout } from '@/types/app'

interface VipHubProps {
  onOpenWorkoutEditor?: (workout?: Workout) => void
  onStartSession?: (workout: Workout) => void
  onOpenReport?: (s?: Record<string, unknown>) => void
}

interface ChatAction {
  label: string
  action: string
  [key: string]: unknown
}

interface ChatMessage {
  id: string
  role: string
  text: string
  isLimit?: boolean
  dataUsed?: Record<string, unknown>[]
  followUps?: string[]
  actions?: ChatAction[]
}
```

### `.catch((): any => null)` — padrão repetido 5 vezes

```typescript
// ANTES
const tJson = await tRes.json().catch((): any => null)
const json = await res.json().catch((): any => null)

// DEPOIS
const tJson = await tRes.json().catch(() => null) as Record<string, unknown> | null
const json = await res.json().catch(() => null) as Record<string, unknown> | null
```

### `chip` function params

```typescript
// ANTES
const chip = (label: string, used: any, limit: any) => {

// DEPOIS
const chip = (label: string, used: number | null | undefined, limit: number | null | undefined) => {
```

### `actions: [] as any[]`

```typescript
// ANTES
const msg = { id: `${id}-a`, role: 'assistant', text: err, actions: [] as any[] }

// DEPOIS
const msg: ChatMessage = { id: `${id}-a`, role: 'assistant', text: err, actions: [] }
```

---

## 2. Corrigir `src/components/ChatListScreen.tsx`

### Interface e useState

```typescript
// ANTES
onSelectUser?: (u: any) => void
const [users, setUsers] = useState<any[]>([])
const handleOpenChat = async (targetUser: any) => {

// DEPOIS
interface ChatUser {
  id: string
  display_name?: string | null
  photo_url?: string | null
  last_seen?: string | null
  [key: string]: unknown
}

onSelectUser?: (u: ChatUser) => void
const [users, setUsers] = useState<ChatUser[]>([])
const handleOpenChat = async (targetUser: ChatUser) => {
```

---

## 3. Corrigir `src/components/IncomingInviteModal.tsx`

```typescript
// ANTES
interface IncomingInviteModalProps {
  onStartSession: (workout: any) => void
}

// DEPOIS
import type { Workout } from '@/types/app'

interface IncomingInviteModalProps {
  onStartSession: (workout: Workout) => void
}
```

---

## 4. Corrigir `src/components/CoachChatModal.tsx`

### useRef e useState

```typescript
// ANTES
const [messages, setMessages] = useState<any[]>([])
const messagesEndRef = useRef<any>(null)
const inputRef = useRef<any>(null)

// DEPOIS
interface CoachMessage {
  role: 'assistant' | 'user'
  content?: string
  text?: string
  [key: string]: unknown
}

const [messages, setMessages] = useState<CoachMessage[]>([])
const messagesEndRef = useRef<HTMLDivElement>(null)
const inputRef = useRef<HTMLInputElement>(null)
```

### forEach com `any`

```typescript
// ANTES
currentExs.forEach((curr: any) => {
  const prev = prevExs.find((p: any) => p.name === curr.name)

// DEPOIS — usar tipo Exercise de types/app
import type { Exercise } from '@/types/app'

// currentExs e prevExs já devem ser tipados como Exercise[]
// Se vieram de session.exercises, e session é ActiveSession, já tem o tipo
currentExs.forEach((curr: Exercise) => {
  const prev = prevExs.find((p: Exercise) => p.name === curr.name)
```

---

## 5. Corrigir `src/components/HistoryList.tsx` ⚠️ Arquivo Grande (1593 linhas)

Este arquivo tem 30+ ocorrências de `any`. Corrija **em grupos**, não tudo de uma vez.

### Grupo A — `catch (e: any)` (padrão mais comum, ~10 ocorrências)

```typescript
// ANTES
} catch (e: any) {
  console.error(e.message)
  // ou
  setError(e.message)
}

// DEPOIS
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(msg)
  // ou
  setError(msg)
}
```

Substitua **todas** as ocorrências de `catch (e: any)` por `catch (e)` com `instanceof Error`.

### Grupo B — Acessos com `as any` em objetos do Supabase

```typescript
// ANTES
const safeUserEmail = String((user as any)?.email || '')
const role = String((user as any)?.role || '')

// DEPOIS — user já tem tipo Profile em types/app.ts
// Se user for do tipo Profile:
const safeUserEmail = String((user as Record<string, unknown>)?.email || '')
const role = String((user as Record<string, unknown>)?.role || '')
// Melhor ainda: verificar se user tem a interface correta e usar diretamente
```

### Grupo C — `.map((e: any) =>`

```typescript
// ANTES
const exercises: ManualExercise[] = (newWorkout.exercises || []).map((e: any) => ({

// DEPOIS
const exercises: ManualExercise[] = (newWorkout.exercises || []).map((e: Record<string, unknown>) => ({
```

### Grupo D — `supabase as any`

```typescript
// ANTES
supabase as any,

// DEPOIS
supabase as unknown,
// ou melhor: verificar o tipo correto esperado pela função e importar SupabaseClient
import type { SupabaseClient } from '@supabase/supabase-js'
// e tipar o parâmetro da função que recebe o supabase
```

### Grupo E — `updateManualExercise` e `updateEditExercise`

```typescript
// ANTES
const updateManualExercise = (idx: number, field: string, value: any) => {
const updateEditExercise = (idx: number, field: string, value: any) => {

// DEPOIS
const updateManualExercise = (idx: number, field: string, value: unknown) => {
const updateEditExercise = (idx: number, field: string, value: unknown) => {
```

### Grupo F — `stats as any`

```typescript
// ANTES
const stats = (data.stats && typeof data.stats === 'object' ? data.stats : {}) as any

// DEPOIS
interface WorkoutStats {
  totalVolume?: number
  totalReps?: number
  duration?: number
  [key: string]: unknown
}
const stats = (data.stats && typeof data.stats === 'object' ? data.stats : {}) as WorkoutStats
```

### Grupo G — `onSave` e `onChange` no ExerciseEditor

```typescript
// ANTES
<ExerciseEditor workout={newWorkout} onSave={setNewWorkout as any} onCancel={() => { }} onChange={setNewWorkout as any} onSaved={() => { }} />

// DEPOIS — verificar a interface do ExerciseEditor e usar o tipo correto
// Se ExerciseEditor aceitar React.Dispatch<React.SetStateAction<Workout>>:
<ExerciseEditor workout={newWorkout} onSave={setNewWorkout} onCancel={() => { }} onChange={setNewWorkout} onSaved={() => { }} />
// Se precisar de cast, use unknown ao invés de any:
<ExerciseEditor workout={newWorkout} onSave={setNewWorkout as unknown as (w: Workout) => void} ... />
```

---

## Verificação Final

```bash
# Contar any restantes nos components corrigidos
grep -c "\bany\b" src/components/VipHub.tsx
grep -c "\bany\b" src/components/ChatListScreen.tsx
grep -c "\bany\b" src/components/CoachChatModal.tsx
grep -c "\bany\b" src/components/HistoryList.tsx

# Type check geral
npx tsc --noEmit
```
