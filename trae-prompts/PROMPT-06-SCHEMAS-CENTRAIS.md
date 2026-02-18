# PROMPT-06 — Criar Schemas Zod Centrais

## Contexto

O projeto tem apenas 2 schemas em `src/schemas/` (`database.ts` e `settings.ts`).
Faltam schemas para as entidades mais usadas nas routes de API, o que faz com que
cada route defina seu schema inline ou não valide nada.

---

## Arquivos a Criar

### 1. `src/schemas/api-requests.ts`

Schemas reutilizáveis para os tipos mais comuns de requests:

```typescript
import { z } from 'zod'

// Paginação padrão
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})
export type Pagination = z.infer<typeof PaginationSchema>

// UUID param
export const UuidParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
})

// User ID param
export const UserIdParamSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
})

// Student ID param
export const StudentIdParamSchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
})

// Busca textual
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
})

// Date range
export const DateRangeSchema = z.object({
  from: z.string().datetime({ message: 'Data inicial inválida' }).optional(),
  to: z.string().datetime({ message: 'Data final inválida' }).optional(),
})
```

---

### 2. `src/schemas/social.ts`

```typescript
import { z } from 'zod'

export const StoryCreateSchema = z.object({
  caption: z.string().max(500).nullable().optional(),
  media_url: z.string().url('URL de mídia inválida').nullable().optional(),
  media_kind: z.enum(['image', 'video']).optional(),
})
export type StoryCreate = z.infer<typeof StoryCreateSchema>

export const StoryCommentSchema = z.object({
  story_id: z.string().uuid('story_id inválido'),
  text: z.string().min(1, 'Comentário não pode ser vazio').max(1000),
})
export type StoryComment = z.infer<typeof StoryCommentSchema>

export const FollowRequestSchema = z.object({
  target_user_id: z.string().uuid('target_user_id inválido'),
})
export type FollowRequest = z.infer<typeof FollowRequestSchema>

export const FollowRespondSchema = z.object({
  follow_id: z.string().uuid('follow_id inválido'),
  action: z.enum(['accept', 'reject']),
})
export type FollowRespond = z.infer<typeof FollowRespondSchema>

export const DirectMessageSchema = z.object({
  channel_id: z.string().min(1, 'channel_id obrigatório'),
  text: z.string().min(1, 'Mensagem não pode ser vazia').max(2000),
})
export type DirectMessage = z.infer<typeof DirectMessageSchema>

export const ChatMessagesQuerySchema = z.object({
  channel_id: z.string().min(1, 'channel_id obrigatório'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})
export type ChatMessagesQuery = z.infer<typeof ChatMessagesQuerySchema>
```

---

### 3. `src/schemas/workout.ts`

```typescript
import { z } from 'zod'

export const SetDetailSchema = z.object({
  set_number: z.number().int().min(1),
  reps: z.union([z.string(), z.number()]).nullable().optional(),
  weight: z.number().nullable().optional(),
  rpe: z.number().min(0).max(10).nullable().optional(),
  is_warmup: z.boolean().optional(),
  completed: z.boolean().optional(),
  advanced_config: z.unknown().nullable().optional(),
})
export type SetDetail = z.infer<typeof SetDetailSchema>

export const ExerciseInputSchema = z.object({
  name: z.string().min(1, 'Nome do exercício obrigatório').max(200),
  sets: z.union([z.number().int().min(0), z.string()]).optional(),
  reps: z.union([z.string(), z.number()]).nullable().optional(),
  rpe: z.union([z.number(), z.string()]).nullable().optional(),
  method: z.string().nullable().optional(),
  rest_time: z.union([z.number(), z.string()]).nullable().optional(),
  video_url: z.string().url().nullable().optional().or(z.literal('')),
  notes: z.string().nullable().optional(),
  cadence: z.string().nullable().optional(),
  order: z.number().int().min(0).optional(),
  set_details: z.array(SetDetailSchema).optional(),
})
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>

export const WorkoutInputSchema = z.object({
  name: z.string().min(1, 'Nome do treino obrigatório').max(200),
  notes: z.string().nullable().optional(),
  date: z.string().optional(),
  is_template: z.boolean().optional(),
  exercises: z.array(ExerciseInputSchema).optional(),
})
export type WorkoutInput = z.infer<typeof WorkoutInputSchema>

export const FinishWorkoutSchema = z.object({
  workout: z.record(z.unknown()),
  elapsedSeconds: z.number().int().min(0),
  logs: z.record(z.unknown()).optional(),
  ui: z.record(z.unknown()).optional(),
  postCheckin: z.record(z.unknown()).nullable().optional(),
})
export type FinishWorkoutInput = z.infer<typeof FinishWorkoutSchema>
```

---

### 4. `src/schemas/admin.ts`

```typescript
import { z } from 'zod'

export const AssignTeacherSchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
  teacher_id: z.string().uuid('teacher_id inválido'),
})
export type AssignTeacher = z.infer<typeof AssignTeacherSchema>

export const StudentStatusSchema = z.object({
  student_id: z.string().uuid('student_id inválido'),
  status: z.enum(['active', 'inactive']),
})
export type StudentStatus = z.infer<typeof StudentStatusSchema>

export const TeacherStatusSchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido'),
  status: z.enum(['active', 'inactive', 'suspended']),
})
export type TeacherStatus = z.infer<typeof TeacherStatusSchema>

export const AccessRequestActionSchema = z.object({
  request_id: z.string().uuid('request_id inválido'),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
})
export type AccessRequestAction = z.infer<typeof AccessRequestActionSchema>

export const VipEntitlementSchema = z.object({
  user_id: z.string().uuid('user_id inválido'),
  plan: z.enum(['basic', 'pro', 'elite']),
  expires_at: z.string().datetime().nullable().optional(),
  credits: z.number().int().min(0).optional(),
})
export type VipEntitlement = z.infer<typeof VipEntitlementSchema>
```

---

## Como Usar nos Routes Existentes

Após criar os schemas, atualize as routes para importá-los:

```typescript
// ❌ ANTES — schema inline em cada route
const schema = z.object({ student_id: z.string().uuid() })

// ✅ DEPOIS — importar schema central
import { AssignTeacherSchema } from '@/schemas/admin'

const { data, response } = await parseJsonBody(req, AssignTeacherSchema)
if (response) return response
```

---

## Verificação Final

```bash
# Confirmar que os arquivos foram criados
ls src/schemas/

# Rodar type check
npx tsc --noEmit
```
