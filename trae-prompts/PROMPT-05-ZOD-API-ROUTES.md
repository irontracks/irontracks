# PROMPT-05 — Adicionar Validação Zod às Routes de API sem Validação

## Contexto

O projeto já tem um utilitário excelente em `src/utils/zod.ts` com `parseJsonBody` e
`parseSearchParams`. Porém, 58 das 133 routes não usam essa validação.

Este prompt foca nas routes de **maior risco** — as que recebem input do usuário sem validar.

---

## Padrão a Seguir

O projeto já usa este padrão nas routes corretas:

```typescript
import { z } from 'zod'
import { parseJsonBody, parseSearchParams } from '@/utils/zod'

// Para GET com query params:
export async function GET(req: Request) {
  const QuerySchema = z.object({
    channel_id: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  const { data, response } = parseSearchParams(req, QuerySchema)
  if (response) return response  // retorna 400 com detalhe dos erros

  // data está tipado e validado aqui
}

// Para POST com body:
export async function POST(req: Request) {
  const BodySchema = z.object({
    message: z.string().min(1).max(2000),
    channel_id: z.string().uuid(),
  })
  const { data, response } = await parseJsonBody(req, BodySchema)
  if (response) return response

  // data está tipado e validado aqui
}
```

---

## Routes Prioritárias para Adicionar Validação

### Grupo 1 — Chat (alto risco, input de usuário)

#### `src/app/api/chat/messages/route.ts`

```typescript
// ANTES — validação manual sem Zod
const channel_id = url.searchParams.get('channel_id') || ''
if (!channel_id) return NextResponse.json({ ok: false, error: 'missing channel_id' }, { status: 400 })

// DEPOIS — com Zod
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

const QuerySchema = z.object({
  channel_id: z.string().min(1, 'channel_id obrigatório'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: q, response } = parseSearchParams(req, QuerySchema)
  if (response) return response

  // Remova também o 'as any' nas linhas abaixo:
  // let profs: any[] = []  →  let profs: Array<{ id: string; display_name: string | null; photo_url: string | null }> = []
  // (e as any)?.message  →  e instanceof Error ? e.message : String(e)
}
```

---

#### `src/app/api/exercises/search/route.ts`

```typescript
// Adicionar validação do parâmetro q
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

const QuerySchema = z.object({
  q: z.string().min(2, 'Busca deve ter ao menos 2 caracteres').max(100),
})

export async function GET(request: Request) {
  // ...auth...
  const { data: q, response } = parseSearchParams(request, QuerySchema)
  if (response) return response
  // Usar q.q ao invés de url.searchParams.get('q')
}
```

---

### Grupo 2 — Workouts (dados sensíveis)

#### `src/app/api/workouts/list/route.ts`
Esta route é GET sem params — OK sem parseSearchParams.
Mas o retorno deve ser tipado:

```typescript
// Substituir:
const rows = data || []
return NextResponse.json({ ok: true, rows })

// Por (adicionar interface):
interface WorkoutRow {
  id: string
  name: string
  user_id: string
}
const rows: WorkoutRow[] = data || []
return NextResponse.json({ ok: true, rows })
```

---

#### `src/app/api/workouts/history/route.ts`

```typescript
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
```

---

### Grupo 3 — Routes Admin (proteção de dados)

#### `src/app/api/admin/students/list/route.ts`

```typescript
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

const QuerySchema = z.object({
  teacher_id: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
```

#### `src/app/api/admin/teachers/list/route.ts`

```typescript
const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).optional(),
})
```

---

### Grupo 4 — VIP Routes

#### `src/app/api/vip/status/route.ts`, `vip/access/route.ts`, `vip/welcome-status/route.ts`
Estas são GET sem params de usuário — não precisam de parseSearchParams.
Mas certifique-se que **o retorno** tem tipo consistente.

---

## Erros Comuns para Corrigir Junto (nas routes acima)

Em TODAS as routes modificadas, substitua também:

```typescript
// ❌ ANTES
} catch (e) {
  return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
}

// ✅ DEPOIS
} catch (e) {
  const message = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ ok: false, error: message }, { status: 500 })
}
```

E substitua:
```typescript
// ❌
let profs: any[] = []

// ✅  
let profs: Array<{ id: string; display_name: string | null; photo_url: string | null }> = []
```

---

## Verificação Final

```bash
# Verificar se parseJsonBody/parseSearchParams está sendo usado nas routes corrigidas
grep -l "parseJsonBody\|parseSearchParams" src/app/api/chat/messages/route.ts
grep -l "parseJsonBody\|parseSearchParams" src/app/api/exercises/search/route.ts

# Compilar
npx tsc --noEmit
```
