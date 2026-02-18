# PROMPTS FASE 5 - Correções Manuais Restantes

Este arquivo contém instruções detalhadas para corrigir os ~175 'any' restantes após os scripts automáticos.

**Use este arquivo como referência** quando quiser continuar a migração TypeScript.

---

## 📊 PROGRESSO APÓS SCRIPTS AUTOMÁTICOS

Se você já executou os passos 0-7 do GUIA_COMPLETO_TYPESCRIPT.md, você está aqui:

```
✅ Scripts automáticos: ~35 any corrigidos
✅ utils/auth/route.ts: 3 any corrigidos
✅ Arquivos lib/: ~14 any corrigidos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TOTAL CORRIGIDO: ~52 any
🎯 RESTANTE: ~233 any
```

---

## 🗺️ MAPA DOS PROMPTS

| Prompt | Arquivos | Any | Tempo | Dificuldade |
|--------|----------|-----|-------|------------|
| F5-C | utils/ (5 arquivos) | 13 | 20min | ⭐⭐ |
| F5-D | types/assessment.ts | 3 | 10min | ⭐ |
| F5-E | TeamWorkoutContext.tsx | 4 | 15min | ⭐⭐ |
| F5-F | ErrorBoundary.tsx | 5 | 15min | ⭐⭐ |
| F5-G | Assessment components | 10 | 20min | ⭐⭐⭐ |
| F5-H | Hooks (2 arquivos) | 5 | 15min | ⭐⭐ |
| F5-I | iron-scanner-actions.ts | 6 | 15min | ⭐⭐ |
| F5-J | API routes (47 arquivos) | 127 | 60min | ⭐⭐⭐⭐ |

**RECOMENDAÇÃO**: Faça um prompt por dia, começando pelos mais fáceis (⭐).

---

## 🔧 PROMPT F5-C: Arquivos utils/ (13 any)

**Tempo estimado:** 20 minutos  
**Dificuldade:** ⭐⭐

### Arquivos para corrigir:

#### 1. **src/utils/platform.ts** (3 any)

**Procure por:**
```typescript
const nav: any = navigator
```

**Mude para:**
```typescript
const nav: Navigator & Record<string, unknown> = navigator
```

**Procure por:**
```typescript
const cap: any
```

**Mude para:**
```typescript
const cap // (remove o ': any', TypeScript vai inferir o tipo sozinho)
```

---

#### 2. **src/utils/rateLimit.ts** (1 any)

**Procure por:**
```typescript
const g: any = globalThis
```

**Mude para:**
```typescript
const g = globalThis as Record<string, unknown>
```

---

#### 3. **src/utils/vip/limits.ts** (2 any)

**Procure por:**
```typescript
override as any
```

**Mude para:**
```typescript
override as Record<string, unknown>
```

---

#### 4. **src/utils/admin/adminFetch.ts** (3 any)

**Procure por:**
```typescript
ok?: any
```

**Mude para:**
```typescript
ok?: boolean
```

**Procure por:**
```typescript
json as any
```

**Mude para:**
```typescript
json as T
```

---

#### 5. **src/utils/workoutWizardGenerator.ts** (2 any)

**Procure por:**
```typescript
return undefined as any
```

**Mude para:**
```typescript
return undefined
```

**Procure por:**
```typescript
exercises: any[]
```

**Mude para:**
```typescript
exercises: unknown[]
```

---

#### 6. **src/utils/training/notesMethodParser.ts** (3 any)

**Procure todas as ocorrências de:**
```typescript
: any[]
```

**Mude para:**
```typescript
: unknown[]
```

---

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-D: types/assessment.ts (3 any)

**Tempo estimado:** 10 minutos  
**Dificuldade:** ⭐

### Arquivo: **src/types/assessment.ts**

**Procure por:**
```typescript
component: React.ComponentType<any>
```

**Mude para:**
```typescript
component: React.ComponentType<Record<string, unknown>>
```

**Procure por:**
```typescript
isValidGender(value: any)
```

**Mude para:**
```typescript
isValidGender(value: unknown)
```

**Procure por:**
```typescript
isValidPhotoType(value: any)
```

**Mude para:**
```typescript
isValidPhotoType(value: unknown)
```

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-E: TeamWorkoutContext.tsx (4 any)

**Tempo estimado:** 15 minutos  
**Dificuldade:** ⭐⭐

### Arquivo: **src/contexts/TeamWorkoutContext.tsx**

Este arquivo provavelmente já tem interfaces definidas no topo. Vamos usar elas!

**Procure por:**
```typescript
payload as any
```

**Opção 1 - Se existir uma interface RealtimePostgresChangesPayload:**
```typescript
payload as RealtimePostgresChangesPayload
```

**Opção 2 - Se não existir:**
```typescript
payload as Record<string, unknown>
```

**Procure por:**
```typescript
showAccepted(inviteRow: any)
```

**Olhe no arquivo se existe uma interface `IncomingInvite` ou similar.**

**Se existir, mude para:**
```typescript
showAccepted(inviteRow: IncomingInvite)
```

**Se não existir, mude para:**
```typescript
showAccepted(inviteRow: Record<string, unknown>)
```

**Procure por:**
```typescript
sendInvite(targetUser: any, workout: any)
```

**Olhe se existem interfaces para User e Workout no arquivo.**

**Se existir, use elas. Se não, crie types simples:**
```typescript
type UserForInvite = { id: string; display_name?: string }
type WorkoutForInvite = { id: string; name: string }

// Depois mude a assinatura:
sendInvite(targetUser: UserForInvite, workout: WorkoutForInvite)
```

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-F: ErrorBoundary.tsx (5 any)

**Tempo estimado:** 15 minutos  
**Dificuldade:** ⭐⭐

### Arquivo: **src/components/ErrorBoundary.tsx**

**1. No topo do arquivo, ANTES da classe, adicione:**

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}
```

**2. Procure pela declaração da classe:**
```typescript
class ErrorBoundary extends React.Component<any, any>
```

**Mude para:**
```typescript
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState>
```

**3. Procure por:**
```typescript
constructor(props: any)
```

**Mude para:**
```typescript
constructor(props: ErrorBoundaryProps)
```

**4. Procure por outros métodos com `any` e troque pelos tipos corretos acima.**

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-G: Assessment Components (10 any)

**Tempo estimado:** 20 minutos  
**Dificuldade:** ⭐⭐⭐

### Arquivo 1: **src/components/assessment/AssessmentPDFGenerator.tsx** (6 any)

Este arquivo tem vários `as any` que geralmente são casts desnecessários.

**Procure por:**
```typescript
formData.gender as any
```

**Veja a interface `AssessmentFormData`. Se `gender` já é `'M' | 'F'`, remova o cast:**
```typescript
formData.gender
```

**Procure por:**
```typescript
} as any, results as any
```

**Tente remover os casts. Se der erro, veja qual tipo a função espera e crie uma interface.**

**Procure por:**
```typescript
isNaN(assessmentDate as any)
```

**Se `assessmentDate` é um `Date`, mude para:**
```typescript
isNaN(assessmentDate.getTime())
```

### Arquivo 2: **src/components/assessment/AssessmentButton.tsx** (4 any)

**Procure por:**
```typescript
mergeImportedFormData = (base: any, incoming: any)
```

**Mude para:**
```typescript
mergeImportedFormData = (base: Record<string, unknown>, incoming: Record<string, unknown>)
```

**Procure por:**
```typescript
const out: any = { ... }
```

**Mude para:**
```typescript
const out: Record<string, unknown> = { ... }
```

**Procure por:**
```typescript
const payload: any = parsed as any
```

**Mude para:**
```typescript
const payload = parsed as Record<string, unknown>
```

**Procure por:**
```typescript
let mergedFormData: any = {}
```

**Mude para:**
```typescript
let mergedFormData: Record<string, unknown> = {}
```

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-H: Hooks (5 any)

**Tempo estimado:** 15 minutos  
**Dificuldade:** ⭐⭐

### Arquivo 1: **src/hooks/useAssessment.ts** (3 any)

**1. No topo, adicione:**
```typescript
import type { User } from '@supabase/supabase-js'
```

**2. Procure por:**
```typescript
const [user, setUser] = useState<any>(null)
```

**Mude para:**
```typescript
const [user, setUser] = useState<User | null>(null)
```

**3. Procure por:**
```typescript
normalizeAssessmentRow = (row: any): Assessment
```

**Mude para:**
```typescript
normalizeAssessmentRow = (row: Record<string, unknown>): Assessment
```

**4. Procure por:**
```typescript
const toNumberOrUndefined = (value: any)
```

**Mude para:**
```typescript
const toNumberOrUndefined = (value: unknown): number | undefined
```

### Arquivo 2: **src/hooks/useVipCredits.ts** (2 any)

**1. Crie uma interface no topo do arquivo:**
```typescript
interface VipCredits {
  chat?: { used: number; limit: number }
  wizard?: { used: number; limit: number }
  insights?: { used: number; limit: number }
  plan?: string
  [key: string]: unknown
}
```

**2. Procure por:**
```typescript
useState<any>(null) // para credits
```

**Mude para:**
```typescript
useState<VipCredits | null>(null)
```

**3. Procure por:**
```typescript
useState<any>(null) // para error
```

**Mude para:**
```typescript
useState<string | null>(null)
```

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-I: iron-scanner-actions.ts (6 any)

**Tempo estimado:** 15 minutos  
**Dificuldade:** ⭐⭐

### Arquivo: **src/actions/iron-scanner-actions.ts**

**Este arquivo usa a API do Google Generative AI.**

**1. Procure por casts `as any` em chamadas de `model.generateContent`:**
```typescript
} as any
] as any
```

**Tente remover os casts. Se der erro, verifique o tipo esperado pelo SDK.**

**2. Procure por:**
```typescript
.map((item: any)
```

**Mude para:**
```typescript
.map((item: unknown)
```

**3. Dentro do .map, procure por:**
```typescript
const anyItem = item as any
```

**Mude para:**
```typescript
const anyItem = item as Record<string, unknown>
```

**4. Procure por:**
```typescript
.filter((x: any): x is IronScannerExercise => !!x)
```

**Mude para:**
```typescript
.filter((x: unknown): x is IronScannerExercise => !!x)
```

**Verificar:**
```bash
npx tsc --noEmit
```

---

## 🔧 PROMPT F5-J: API Routes (127 any em 47 arquivos)

**Tempo estimado:** 60 minutos  
**Dificuldade:** ⭐⭐⭐⭐

**ATENÇÃO:** Este é o maior bloco! Recomendo fazer em **sessões de 15 minutos**, 5 arquivos por vez.

### Estratégia:

Os 47 arquivos de API seguem padrões muito similares. Vou agrupar por padrão, não por arquivo.

---

### **GRUPO 1: Routes com helper de erro (2 arquivos)**

**Arquivos:**
- `src/app/api/teachers/wallet/route.ts`
- `src/app/api/account/export/route.ts`

**Padrão a procurar:**
```typescript
const isMissingColumn = (err: any, column: string)
```

**Mude para:**
```typescript
const isMissingColumn = (err: unknown, column: string): boolean
```

**Dentro da função, mude:**
```typescript
err?.message
```

**Para:**
```typescript
(err as Record<string, unknown>)?.message
```

**Outros padrões nestes arquivos:**
```typescript
let teacher: any | null = null  →  let teacher: Record<string, unknown> | null = null
const payload: any = { ... }    →  const payload: Record<string, unknown> = { ... }
.map((w: any)                   →  .map((w: Record<string, unknown>)
```

---

### **GRUPO 2: Routes de admin/payload (5 arquivos)**

**Arquivos:**
- `src/app/api/workouts/update/route.ts`
- `src/app/api/admin/teachers/asaas/route.ts`
- `src/app/api/dashboard/bootstrap/route.ts`
- `src/app/api/vip/weekly-summary/route.ts`
- `src/app/api/diagnostics/iron-rank/route.ts`

**Padrões comuns:**
```typescript
const X: any = {}               →  const X: Record<string, unknown> = {}
const prs: any[] = []           →  const prs: Array<Record<string, unknown>> = []
let X: any | null = null        →  let X: Record<string, unknown> | null = null
.map((row: any)                 →  .map((row: Record<string, unknown>)
.map((item: any)                →  .map((item: Record<string, unknown>)
```

---

### **GRUPO 3: Routes de exercises/canonicalize (2 arquivos)**

**Arquivos:**
- `src/app/api/exercises/canonicalize/route.ts`
- `src/app/api/admin/exercises/canonicalize/backfill/route.ts`

**Padrões:**
```typescript
body = await req.json()         →  body = await req.json() as Record<string, unknown>
.map((item: any)                →  .map((item: Record<string, unknown>)
```

---

### **GRUPO 4: Routes de AI (2 arquivos)**

**Arquivos:**
- `src/app/api/ai/workout-wizard/route.ts`
- `src/app/api/ai/coach-chat/route.ts`

**Padrões:**
```typescript
safeArray<any>(...)             →  safeArray<Record<string, unknown>>(...)
.filter((t: any)                →  .filter((t: Record<string, unknown>)
let history: any                →  let history: Array<{role: string; content: string}> | null
```

---

### **GRUPO 5: Todos os outros routes pequenos (~36 arquivos)**

Para cada arquivo, procure por:

```typescript
// Em callbacks .map
.map((x: any)  →  .map((x: Record<string, unknown>)

// Em variáveis de resultado
any = {}       →  Record<string, unknown> = {}

// Em responses JSON
json as any    →  json as Record<string, unknown>
```

---

### **Como fazer:**

1. **Escolha um grupo** (comece pelo 1)

2. **Abra os arquivos do grupo** (3-5 por vez)

3. **Use Find & Replace (Ctrl+H ou Cmd+H):**
   - Procure: `: any`
   - Veja cada ocorrência e substitua pelo tipo apropriado

4. **Após cada grupo, verifique:**
   ```bash
   npx tsc --noEmit
   ```

5. **Se der NOVOS erros, reverta aquele arquivo** e pule ele por enquanto.

6. **Commit após cada grupo:**
   ```bash
   git add .
   git commit -m "Fase 5: Grupo X de API routes corrigido"
   ```

---

## ✅ CHECKLIST FINAL

Após completar todos os prompts:

```bash
# 1. Contar 'any' restantes
python3 -c "import os,re; total=0; [total:=total+len(re.findall(r'\\b(: any\\b|as any\\b|<any>|any\\[\\])',open(f'{r}/{f}',errors='ignore').read())) for r,d,files in os.walk('src') for f in files if f.endswith(('.ts','.tsx')) and ' 2.' not in f]; print(f'Any restantes: {total}')"

# 2. Verificar compilação
npx tsc --noEmit

# 3. Rodar testes (se tiver)
npm test

# 4. Commit final
git add .
git commit -m "Fase 5 completa: Migração TypeScript ~90% concluída"
```

---

## 💡 DICAS

1. **Faça aos poucos**: Um prompt por dia é melhor que tudo de uma vez
2. **Sempre faça commit** após cada grupo de correções
3. **Se travar**, pule aquele arquivo e volte depois
4. **Use o editor**: O VSCode vai mostrar os erros em tempo real
5. **Não tenha pressa**: Qualidade > Velocidade

---

## 📞 PRECISA DE AJUDA?

Se travar em qualquer prompt:
1. Anote qual prompt (F5-C, F5-D, etc)
2. Copie a mensagem de erro
3. Me manda que eu ajudo!

**Boa sorte!** 🚀
