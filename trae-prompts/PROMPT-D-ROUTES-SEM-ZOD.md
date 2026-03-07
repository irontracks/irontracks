# PROMPT-D — Adicionar Zod às Routes que Leem Parâmetros sem Validação

## Contexto

Das 54 routes sem Zod, **18 realmente leem query params ou body** sem validar.
As restantes 36 são GET sem parâmetros — não precisam de Zod.

Este prompt foca nas 18 que precisam de validação.

---

## Padrão a Usar

```typescript
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'
// ou para schemas reutilizáveis:
import { PaginationSchema } from '@/schemas/api-requests'
```

---

## 1. `src/app/api/admin/access-requests/list/route.ts`

```typescript
// ANTES — validação manual
const status = searchParams.get('status')
const page = parseInt(searchParams.get('page') || '1')
const limit = parseInt(searchParams.get('limit') || '50')

// DEPOIS
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

const QuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const { data: q, response } = parseSearchParams(req, QuerySchema)
if (response) return response

const offset = (q.page - 1) * q.limit
```

---

## 2. `src/app/api/admin/workouts/history/route.ts`

```typescript
// ANTES
const id = url.searchParams.get('id') || undefined
const email = url.searchParams.get('email') || undefined

// DEPOIS
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

const QuerySchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email().optional(),
})

const { data: q, response } = parseSearchParams(req, QuerySchema)
if (response) return response

// Usar q.id e q.email
```

---

## 3. `src/app/api/admin/workouts/by-student/route.ts`

```typescript
const QuerySchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
```

---

## 4. `src/app/api/admin/teachers/students/route.ts`

```typescript
const QuerySchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
```

---

## 5. `src/app/api/admin/teachers/workouts/history/route.ts`

```typescript
const QuerySchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido'),
})
```

---

## 6. `src/app/api/admin/teachers/workouts/templates/route.ts`

```typescript
const QuerySchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido'),
})
```

---

## 7. `src/app/api/admin/teachers/inbox/route.ts`

```typescript
const QuerySchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
```

---

## 8. `src/app/api/admin/user-activity/events/route.ts`

### Também corrigir `safeStr(v: any)` e `safeIso(v: any)` no topo do arquivo

```typescript
// ANTES
const safeStr = (v: any, max = 200) => {
const safeIso = (v: any) => {

// DEPOIS
const safeStr = (v: unknown, max = 200): string => {
  const s = typeof v === 'string' ? v.trim() : String(v ?? '').trim()
  return s.length > max ? s.slice(0, max) : s
}

const safeIso = (v: unknown): string | null => {
  try {
    if (!v) return null
    const s = String(v).trim()
    if (!s) return null
    const d = new Date(s)
    const t = d.getTime()
    if (!Number.isFinite(t)) return null
    return d.toISOString()
  } catch {
    return null
  }
}
```

```typescript
// Schema de query
const QuerySchema = z.object({
  user_id: z.string().uuid('user_id inválido').optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})
```

---

## 9. `src/app/api/admin/user-activity/summary/route.ts` e `users/route.ts`

```typescript
// summary
const QuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

// users
const QuerySchema = z.object({
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
```

---

## 10. `src/app/api/social/stories/list/route.ts`

```typescript
// Verificar se a route lê algum searchParam e adicionar schema se necessário
// Esta route parece não ter params obrigatórios — apenas adicionar tratamento de erro
```

---

## 11. `src/app/api/social/stories/views/route.ts`

```typescript
const QuerySchema = z.object({
  story_id: z.string().uuid('story_id inválido'),
})
```

---

## 12. `src/app/api/teacher/inbox/feed/route.ts`

```typescript
const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})
```

---

## 13. `src/app/api/teacher/execution-videos/by-student/route.ts`

```typescript
const QuerySchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
})
```

---

## 14. `src/app/api/team/invite-candidates/route.ts`

```typescript
const QuerySchema = z.object({
  q: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
```

---

## 15. `src/app/api/updates/unseen/route.ts`

```typescript
// Verificar se lê algum param. Se não, sem schema necessário.
```

---

## 16. `src/app/api/cron/cleanup-expired/route.ts` e `purge-soft-delete-bin/route.ts`

```typescript
// Estas routes de cron são chamadas internamente.
// Adicionar apenas verificação de Authorization header:
const authHeader = req.headers.get('authorization')
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}
```

---

## Nota Sobre Routes GET Sem Params

As seguintes routes **não precisam de Zod** — são GET sem input do usuário:

- `version/route.ts`, `supabase/status/route.ts`, `marketplace/health/route.ts`
- `auth/ping/route.ts`, `profiles/ping/route.ts`
- `vip/status/route.ts`, `vip/access/route.ts`, `vip/welcome-status/route.ts`, `vip/welcome-seen/route.ts`
- `debug/cookies/route.ts`, `teachers/me/route.ts`, `teachers/accept/route.ts`
- `students/me/status/route.ts`, `workouts/list/route.ts`
- `diagnostics/iron-rank/route.ts`, `diagnostics/workouts/route.ts`
- `app/plans/route.ts`, `user/vip-credits/route.ts`

---

## Verificação Final

```bash
# Contar routes que ainda leem searchParams sem parseSearchParams
grep -rl "searchParams.get\|new URL(req" src/app/api --include="route.ts" | while read f; do
  if ! grep -q "parseSearchParams\|parseJsonBody" "$f"; then
    echo "SEM ZOD: $f"
  fi
done

npx tsc --noEmit
```
