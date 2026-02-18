# PROMPT-07 — Melhorias Gerais de Consistência e Qualidade

## Contexto

Este prompt consolida melhorias de consistência que não são bugs críticos mas afetam
a qualidade e manutenibilidade do projeto a longo prazo.

---

## 1. Padronizar Tratamento de Erros nas Routes

Em muitas routes existe o padrão inconsistente:

```typescript
// ❌ ANTES — mix de padrões
} catch (e) {
  return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
}
// ou
} catch (e) {
  return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
}
```

### Criar utilitário centralizado em `src/utils/api.ts`

```typescript
import { NextResponse } from 'next/server'

/**
 * Extrai mensagem de erro de qualquer valor
 */
export const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

/**
 * Resposta padrão de erro interno
 */
export const errorResponse = (e: unknown, status = 500) =>
  NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status })

/**
 * Resposta padrão de não autorizado
 */
export const unauthorizedResponse = () =>
  NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

/**
 * Resposta padrão de sucesso
 */
export const successResponse = <T>(data: T, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: true, data, ...extra })
```

Depois, em cada route:
```typescript
import { errorResponse, unauthorizedResponse } from '@/utils/api'

// ✅ DEPOIS
} catch (e) {
  return errorResponse(e)
}
```

---

## 2. Padronizar Campos Duplicados em `types/app.ts`

O tipo `Exercise` tem campos duplicados (camelCase e snake_case):

```typescript
// ATUAL — campos duplicados
export interface Exercise {
  restTime?: number | string | null;
  rest_time?: number | string | null;    // DB column
  videoUrl?: string | null;
  video_url?: string | null;             // DB column
}
```

Isso é intencional para compatibilidade com o banco, mas deve ter documentação clara:

```typescript
// MELHORADO — documentar a razão da duplicação
export interface Exercise {
  id?: string;
  name: string;
  sets: number | string;
  reps: string | number | null;
  rpe: number | string | null;
  method?: string | null;
  /** @deprecated Use rest_time (DB column name) */
  restTime?: number | string | null;
  /** DB column: rest_time */
  rest_time?: number | string | null;
  /** @deprecated Use video_url (DB column name) */
  videoUrl?: string | null;
  /** DB column: video_url */
  video_url?: string | null;
  notes?: string | null;
  cadence?: string | null;
  type?: string;
  setDetails?: SetDetail[];
  /** @deprecated Use setDetails */
  set_details?: SetDetail[];
  order?: number;
  workout_id?: string;
  _itx_exKey?: string;
}
```

---

## 3. Melhorar ESLint Config

O arquivo `eslint.config.ts` está mínimo. Adicione regras para evitar regressões:

```typescript
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    '.vercel/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '_archive/**',
    'claude/**',
    '_macro_mixer_orig/**',
    '_legacy_backup/**',
  ]),
  {
    rules: {
      // Proibir any explícito nas novas adições
      '@typescript-eslint/no-explicit-any': 'warn',
      // Evitar console.log em produção (use o logger)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Garantir que promises sejam tratadas
      '@typescript-eslint/no-floating-promises': 'off', // ativar quando o projeto estiver 100% tipado
    },
  },
])
```

---

## 4. Adicionar Zod ao `src/lib/finishWorkoutPayload.ts`

O arquivo atual usa `Record<string, unknown>` e tipagem manual. Pode usar o schema criado
no PROMPT-06:

```typescript
// ANTES
interface FinishWorkoutInput {
  workout: Record<string, unknown>
  elapsedSeconds: number
  logs: Record<string, unknown>
  ui: Record<string, unknown>
  postCheckin?: Record<string, unknown> | null
}

// DEPOIS — importar do schema central
import { type FinishWorkoutInput } from '@/schemas/workout'
// E usar o schema para validar na route /api/workouts/finish
```

---

## 5. Padronizar `vip/periodization/create/route.ts` (16 `any`)

Esta é a route com mais `any` (16 ocorrências). O padrão de `(workout as any).exercises`
deve ser substituído por tipagem correta:

```typescript
// ❌ ANTES
const exercises = workout && Array.isArray((workout as any).exercises)
  ? ((workout as any).exercises as unknown[]) : []

// ✅ DEPOIS — criar interface local
interface WorkoutInput {
  exercises?: unknown[]
  [key: string]: unknown
}
const w = workout as WorkoutInput
const exercises = Array.isArray(w.exercises) ? w.exercises : []
```

Para a chamada da API Gemini:
```typescript
// ❌
const result = await model.generateContent([{ text: prompt }] as any)

// ✅
const result = await model.generateContent([{ text: prompt }])
// Se o tipo não aceitar, use:
const result = await (model.generateContent as (parts: Array<{ text: string }>) => Promise<unknown>)([{ text: prompt }])
```

---

## 6. Remover `void UserSettingsSchema` desnecessário

Em `src/hooks/useUserSettings.ts`:

```typescript
// ❌ REMOVER — linha desnecessária
void UserSettingsSchema

// Esta linha não faz nada útil — provavelmente foi adicionada para silenciar
// um aviso de "import não usado" que já não existe mais
```

---

## 7. Revisar `src/types/app.ts` — SetDetail com alias legacy

```typescript
// ATUAL
export interface SetDetail {
  is_warmup: boolean;
  isWarmup?: boolean; // Legacy/Alias
  advanced_config: AdvancedConfig | AdvancedConfig[] | null;
  advancedConfig?: AdvancedConfig | AdvancedConfig[] | null; // Legacy/Alias
}

// MELHORIA — marcar como deprecated para guiar a remoção futura
export interface SetDetail {
  is_warmup: boolean;
  /** @deprecated Use is_warmup */
  isWarmup?: boolean;
  advanced_config: AdvancedConfig | AdvancedConfig[] | null;
  /** @deprecated Use advanced_config */
  advancedConfig?: AdvancedConfig | AdvancedConfig[] | null;
}
```

---

## Verificação Final

```bash
# Verificar erros TypeScript
npx tsc --noEmit

# Verificar ESLint
npx eslint src/ --ext .ts,.tsx 2>&1 | grep "error" | wc -l

# Build completo
npm run build
```

Após este prompt, o projeto deve ter:
- ✅ Zero arquivos .js duplicados (feito no PROMPT-01)
- ✅ Zero `any` em tipos principais (PROMPT-02)
- ✅ tsconfig correto com strict mode (PROMPT-03)
- ✅ Componentes admin tipados (PROMPT-04)  
- ✅ Routes críticas com validação Zod (PROMPT-05)
- ✅ Schemas centrais criados (PROMPT-06)
- ✅ Utilitários de api e consistência geral (PROMPT-07)
