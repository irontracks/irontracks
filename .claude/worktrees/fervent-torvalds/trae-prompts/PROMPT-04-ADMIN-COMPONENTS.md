# PROMPT-04 — Tipagem Correta nos Componentes Admin

## Contexto

Os componentes `RequestsTab.tsx` e `AdminVipReports.tsx` em `src/components/admin/`
foram migrados para TypeScript mas ainda usam `any` em lugares críticos.

---

## 1. Corrigir `src/components/admin/RequestsTab.tsx`

### Problemas Identificados

```typescript
// ❌ ANTES
const [requests, setRequests] = useState<any[]>([])
const [processing, setProcessing] = useState<any>(null)
const handleAction = async (req: any, action: string) => { ... }
```

### Correção

Adicione uma interface para o tipo de request e substitua os `any`:

```typescript
// ✅ DEPOIS — Adicionar no topo do arquivo (antes do componente)
interface AccessRequest {
  id: string
  user_id?: string
  user_name?: string
  user_email?: string
  phone?: string
  birth_date?: string
  gender?: string
  objective?: string
  training_days?: string
  experience_level?: string
  gym_access?: boolean
  injuries?: string
  teacher_id?: string
  teacher_name?: string
  status: 'pending' | 'approved' | 'rejected' | string
  created_at: string
  [key: string]: unknown
}

// ✅ No componente:
const [requests, setRequests] = useState<AccessRequest[]>([])
const [processing, setProcessing] = useState<string | null>(null) // id do item em processamento
const handleAction = async (req: AccessRequest, action: 'approve' | 'reject' | string) => { ... }
```

### Cuidado ao corrigir `handleAction`
Verifique o corpo da função e certifique-se que os acessos às propriedades de `req`
usam a interface `AccessRequest` acima. Substitua `req.qualquerCoisa` pelos campos tipados.

---

## 2. Corrigir `src/components/admin/AdminVipReports.tsx`

### Problema Identificado

```typescript
// ❌ ANTES (linha ~53)
supabase: any; // Mantendo any por enquanto para compatibilidade
```

### Correção

Importe o tipo correto do Supabase:

```typescript
// ✅ Adicionar import no topo
import type { SupabaseClient } from '@supabase/supabase-js'

// ✅ Substituir o campo any
supabase: SupabaseClient;
// ou, se for uma prop opcional:
supabase?: SupabaseClient;
```

Se o tipo exato do client com tipos do banco não estiver disponível, use:
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
```

---

## 3. Verificar outros componentes com `any`

Rode o seguinte para encontrar outros componentes com `any` explícito:

```bash
grep -rn "\bany\b" src/components --include="*.tsx" --include="*.ts" | grep -v "\/\/"
```

Para cada ocorrência, avalie se pode ser substituída por:
- `unknown` (quando o tipo é verdadeiramente desconhecido)
- Um tipo/interface específico
- `Record<string, unknown>` (para objetos dinâmicos)

---

## Verificação Final

```bash
npx tsc --noEmit
```

Não deve apresentar erros novos relacionados aos componentes admin.
