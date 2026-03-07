# PROMPT-02 — Corrigir Tipos `any` nos Arquivos de Types

## Contexto

Os arquivos em `src/types/` contêm vários usos de `any` que devem ser tipados corretamente.
O projeto já tem os tipos corretos definidos em `src/types/app.ts` — use-os como referência.

---

## 1. Corrigir `src/types/admin.ts`

### Problema atual
```typescript
export interface AdminUser {
  workouts?: any[];          // ❌
  last_workout?: any;        // ❌
  [key: string]: any;        // ❌ em vários lugares
}

export interface AdminWorkoutTemplate {
  exercises: any[];          // ❌
}
```

### Correção esperada

Importe os tipos de `src/types/app.ts` e aplique:

```typescript
import type { Workout, Exercise } from '@/types/app'

export interface AdminUser {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  role?: string;
  photo_url?: string;
  status?: string;
  teacher_id?: string;
  created_at?: string;
  last_sign_in_at?: string;
  plan?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  objective?: string;
  injuries?: string;
  training_days?: string;
  experience_level?: string;
  gym_access?: boolean;
  active?: boolean;
  workouts?: Workout[];             // ✅ era any[]
  last_workout?: Workout | null;    // ✅ era any
  [key: string]: unknown;           // ✅ era [key: string]: any
}

export interface AdminTeacher extends AdminUser {
  specialty?: string;
  bio?: string;
  instagram?: string;
  students_count?: number;
}

export interface AdminStudent extends AdminUser {
  teacher_name?: string;
  last_workout_date?: string;
  workouts_count?: number;
  [key: string]: unknown;           // ✅ era any
}

export interface ErrorReport {
  id: string;
  user_id?: string;
  user_email?: string;
  userEmail?: string;
  message: string;
  stack?: string;
  pathname?: string;
  created_at: string;
  status: 'open' | 'resolved' | 'ignored' | string;
  browser_info?: string;
  os_info?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;           // ✅ era any
}

export interface ExecutionVideo {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  exercise_name: string;
  video_url: string;
  feedback?: string;
  status: 'pending' | 'reviewed' | 'approved' | 'rejected' | string;
  created_at: string;
  workout_id?: string;
  [key: string]: unknown;           // ✅ era any
}

export interface AdminWorkoutTemplate {
  id: string;
  title: string;
  description?: string;
  exercises: Exercise[];            // ✅ era any[]
  created_at: string;
  updated_at?: string;
  is_public?: boolean;
  owner_id?: string;
  tags?: string[];
  difficulty?: string;
  [key: string]: unknown;           // ✅ era any
}
```

---

## 2. Corrigir `src/types/app.ts`

### Problema: `UserRecord` com `[key: string]: any`

```typescript
// ANTES (❌)
export interface UserRecord {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  role?: string;
  [key: string]: any;
}

// DEPOIS (✅)
export interface UserRecord {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  role?: string;
  [key: string]: unknown;
}
```

---

## 3. Corrigir `src/types/social.ts`

```typescript
// ANTES (❌)
export type AppNotification = {
  metadata?: Record<string, any> | null
}

// DEPOIS (✅)
export type AppNotification = {
  metadata?: Record<string, unknown> | null
}
```

---

## 4. Corrigir `src/types/assessment.ts`

Localizar:
```typescript
component: React.ComponentType<any>;
```

Substituir por:
```typescript
component: React.ComponentType<Record<string, unknown>>;
```

---

## Verificação Final

Após as correções:
1. `tsc --noEmit` não deve apresentar novos erros
2. Os arquivos que importam de `types/admin.ts` devem continuar compilando:
   - `src/components/AdminPanelV2.tsx`
   - `src/components/admin/AdminVipReports.tsx`
   - `src/components/admin/RequestsTab.tsx`
   - Routes em `src/app/api/admin/`
