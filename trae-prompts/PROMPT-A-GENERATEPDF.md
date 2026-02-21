# PROMPT-A — Corrigir generatePdf.js e generatePdf.ts

## Situação

Existe um `src/utils/report/generatePdf.js` **e** um `src/utils/report/generatePdf.ts`.
O `.ts` foi criado mas ainda usa `formData: any` e `results: any` nos parâmetros.
O `.js` deve ser deletado.

---

## Ação 1 — Deletar o arquivo JS

```
DELETE: src/utils/report/generatePdf.js
```

---

## Ação 2 — Corrigir `src/utils/report/generatePdf.ts`

O arquivo atual tem:
```typescript
export async function generateAssessmentPdf(formData: any, results: any, studentName: string): Promise<Blob>
```

### Criar interfaces para os parâmetros

Adicione as interfaces **no topo do arquivo**, antes da função:

```typescript
interface AssessmentFormData {
  assessment_date?: string | null
  weight?: number | string | null
  height?: number | string | null
  age?: number | string | null
  gender?: string | null
  // Circunferências
  arm_circ?: number | null
  chest_circ?: number | null
  waist_circ?: number | null
  hip_circ?: number | null
  thigh_circ?: number | null
  calf_circ?: number | null
  // Dobras cutâneas
  triceps_skinfold?: number | null
  biceps_skinfold?: number | null
  subscapular_skinfold?: number | null
  suprailiac_skinfold?: number | null
  abdominal_skinfold?: number | null
  thigh_skinfold?: number | null
  calf_skinfold?: number | null
  [key: string]: unknown
}

interface BodyComposition {
  bodyFatPercentage?: number | null
  sumOfSkinfolds?: number | null
  leanMass?: number | null
  fatMass?: number | null
  bmi?: number | null
  bmr?: number | null
  tdee?: number | null
  [key: string]: unknown
}

interface AssessmentResults {
  bodyComposition?: BodyComposition | null
  [key: string]: unknown
}
```

### Alterar a assinatura da função

```typescript
// ANTES
export async function generateAssessmentPdf(formData: any, results: any, studentName: string): Promise<Blob>

// DEPOIS
export async function generateAssessmentPdf(
  formData: AssessmentFormData,
  results: AssessmentResults,
  studentName: string
): Promise<Blob>
```

### Substituir acessos internos com `as any`

Dentro do corpo da função, qualquer `(data as any)?.campo` ou `(metrics as any)?.campo`
pode ser trocado por acesso direto, pois agora `data` e `metrics` são tipados:

```typescript
// ANTES
const bodyFatPercentage = Number(bodyComposition?.bodyFatPercentage ?? 0) || 0

// DEPOIS (sem mudança necessária — já funciona com o tipo)
const bodyFatPercentage = Number(bodyComposition?.bodyFatPercentage ?? 0) || 0
```

Se houver algum `as any` residual dentro da função, substituir por `as unknown` ou
adicionar o campo à interface correspondente.

---

## Verificação

```bash
# Confirmar que .js foi deletado
ls src/utils/report/generatePdf.js  # deve retornar "No such file"

# Confirmar que .ts compila sem any
grep -n "\bany\b" src/utils/report/generatePdf.ts

# Type check
npx tsc --noEmit
```
