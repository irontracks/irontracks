# Critical Bugs Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 4 bugs críticos que afetam usuários em produção hoje.

**Architecture:** Correções cirúrgicas e independentes — cada task é um bug isolado que pode ser corrigido e commitado separadamente sem afetar os outros.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Supabase (PostgreSQL), Capacitor (iOS/Android), Tailwind CSS v4

---

## Mapa de arquivos

| Arquivo | Motivo da mudança |
|---------|-------------------|
| `supabase/migrations/` (novo) | Adicionar colunas `triceps_skinfold_left/right` e `biceps_skinfold_left/right` na tabela `assessments` |
| `src/components/workout/set-renderers/normalSet.tsx` | Salvar `restStartMs` no log ao completar série (linha ~298) |
| `src/components/workout/RestTimerOverlay.tsx` | Bloquear cliques acidentais na tela verde (linha ~436) |
| `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` | Corrigir destino do botão Carteira (linha 702) |

---

## Task 1: Migration — colunas bilaterais de dobras cutâneas na avaliação física

**Por que quebra hoje:** O tipo `Assessment` em `src/types/assessment.ts` declara `triceps_skinfold_left`, `triceps_skinfold_right`, `biceps_skinfold_left`, `biceps_skinfold_right`. O hook `useAssessment.ts` inclui esses campos no INSERT. Supabase retorna erro `column triceps_skinfold_left of relation assessments does not exist` — a avaliação falha silenciosamente e nunca é salva.

**Arquivos:**
- Criar: `supabase/migrations/<timestamp>_add_bilateral_skinfolds.sql`

- [ ] **Step 1: Confirmar colunas ausentes no banco**

```bash
# Deve retornar 0 linhas (colunas não existem)
npx supabase db diff --linked 2>/dev/null | grep triceps_skinfold || echo "confirmed: columns missing"
```

- [ ] **Step 2: Aplicar migration via MCP**

Use a ferramenta `mcp__supabase__apply_migration` com:
- name: `add_bilateral_skinfolds`
- query:
```sql
-- Adiciona colunas bilaterais de dobras cutâneas que o TypeScript já usa
-- mas que não existiam no schema do banco, causando falha silenciosa no INSERT
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS triceps_skinfold_left  numeric,
  ADD COLUMN IF NOT EXISTS triceps_skinfold_right numeric,
  ADD COLUMN IF NOT EXISTS biceps_skinfold_left   numeric,
  ADD COLUMN IF NOT EXISTS biceps_skinfold_right  numeric;
```

- [ ] **Step 3: Verificar que as colunas existem**

```sql
-- Rodar via mcp__supabase__execute_sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'assessments'
  AND column_name  IN (
    'triceps_skinfold_left', 'triceps_skinfold_right',
    'biceps_skinfold_left',  'biceps_skinfold_right'
  );
-- Esperado: 4 linhas com data_type = 'numeric'
```

- [ ] **Step 4: TypeScript check**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npx tsc --noEmit
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "fix: add missing bilateral skinfold columns to assessments table

triceps_skinfold_left/right and biceps_skinfold_left/right were declared
in the TypeScript Assessment type but absent from the DB schema, causing
every assessment save to fail silently with a Postgres column error."
```

---

## Task 2: Salvar `restStartMs` no log ao completar série (normalSet)

**Por que quebra hoje:** `useActiveWorkoutController.ts` lê `log.restStartMs` para calcular `restSeconds` no relatório. Mas `normalSet.tsx` `handleComplete` (linha ~298) só passa `restStartedAtMs` para o contexto do timer via `startTimer(...)` — nunca escreve `restStartMs` no próprio log com `updateLog`. Resultado: `log.restStartMs` é sempre `undefined`, `restSeconds` nunca é calculado, o relatório mostra "0s de descanso".

**Arquivos:**
- Modificar: `src/components/workout/set-renderers/normalSet.tsx` (linhas ~298–308)

- [ ] **Step 1: Localizar o bloco exato em normalSet.tsx**

Abrir `src/components/workout/set-renderers/normalSet.tsx` e encontrar `handleComplete` (função por volta da linha 280). O bloco `updateLog` relevante é:

```typescript
// ANTES (linha ~298):
updateLog(key, {
  done: nextDone,
  completedAtMs:    nextDone ? nowMs : null,
  executionSeconds: nextDone ? executionSeconds : null,
  advanced_config:  cfg ?? log.advanced_config ?? null,
});

if (nextDone && restTime && restTime > 0) {
  const nextPlanned = getPlannedSet(ex, setIdx + 1);
  const nextKey     = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
  startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
}
```

- [ ] **Step 2: Aplicar o fix — adicionar restStartMs ao updateLog**

Substituir o bloco acima por:

```typescript
// DEPOIS: restStartMs salvo no log para que handleTimerFinish
// consiga calcular restSeconds = now - restStartMs no relatório
updateLog(key, {
  done: nextDone,
  completedAtMs:    nextDone ? nowMs : null,
  executionSeconds: nextDone ? executionSeconds : null,
  restStartMs:      nextDone && restTime && restTime > 0 ? nowMs : null,
  advanced_config:  cfg ?? log.advanced_config ?? null,
});

if (nextDone && restTime && restTime > 0) {
  const nextPlanned = getPlannedSet(ex, setIdx + 1);
  const nextKey     = nextPlanned ? `${exIdx}-${setIdx + 1}` : null;
  startTimer(restTime, { kind: 'rest', key, nextKey, restStartedAtMs: nowMs });
}
```

- [ ] **Step 3: TypeScript + ESLint**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npx tsc --noEmit
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs \
  src/components/workout/set-renderers/normalSet.tsx --max-warnings 0
```
Esperado: sem output (zero erros, zero warnings).

- [ ] **Step 4: Commit**

```bash
git add src/components/workout/set-renderers/normalSet.tsx
git commit -m "fix: save restStartMs to log in normalSet handleComplete

handleTimerFinish in useActiveWorkoutController reads log.restStartMs to
compute restSeconds for the workout report. normalSet was passing
restStartedAtMs only to the timer context, never writing it to the log,
so restSeconds was always 0 in every report."
```

---

## Task 3: Bloquear cliques acidentais na tela verde de recuperação

**Por que quebra hoje:** Ao terminar o descanso, `RestTimerOverlay.tsx` exibe uma div `fixed inset-0 z-[2000]` verde/azul. Esse div não captura eventos de toque/clique — eventos passam para os elementos do modal de treino abaixo. O usuário pode clicar acidentalmente em botões de série, input de peso, etc.

**Arquivos:**
- Modificar: `src/components/workout/RestTimerOverlay.tsx` (linha ~436)

- [ ] **Step 1: Localizar o overlay "finished flash" em RestTimerOverlay.tsx**

Encontrar este trecho (linha ~435):

```tsx
{/* Finished flash */}
{isFinished && !isTransition && (
    <div className={`fixed inset-0 z-[2000] backdrop-blur-sm flex flex-col items-center justify-center ${isSideRest ? 'bg-blue-600/90' : 'bg-green-600/90'}`}>
        <div className="text-7xl mb-4">{isSideRest ? '🔄' : '💪'}</div>
        <h1 className="text-5xl font-black text-white uppercase tracking-tighter">{isSideRest ? 'TROCA!' : 'BORA!'}</h1>
        <p className="text-white/80 font-bold mt-2 text-lg">{isSideRest ? 'Agora o outro lado' : 'Descanso finalizado'}</p>
    </div>
)}
```

- [ ] **Step 2: Adicionar bloqueio de eventos ao overlay**

Substituir por:

```tsx
{/* Finished flash — pointer capture prevents accidental taps on workout modal below */}
{isFinished && !isTransition && (
    <div
        className={`fixed inset-0 z-[2000] backdrop-blur-sm flex flex-col items-center justify-center ${isSideRest ? 'bg-blue-600/90' : 'bg-green-600/90'}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
    >
        <div className="text-7xl mb-4">{isSideRest ? '🔄' : '💪'}</div>
        <h1 className="text-5xl font-black text-white uppercase tracking-tighter">{isSideRest ? 'TROCA!' : 'BORA!'}</h1>
        <p className="text-white/80 font-bold mt-2 text-lg">{isSideRest ? 'Agora o outro lado' : 'Descanso finalizado'}</p>
    </div>
)}
```

- [ ] **Step 3: TypeScript + ESLint**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npx tsc --noEmit
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs \
  src/components/workout/RestTimerOverlay.tsx --max-warnings 0
```
Esperado: sem output.

- [ ] **Step 4: Commit**

```bash
git add src/components/workout/RestTimerOverlay.tsx
git commit -m "fix: block accidental taps on finished rest overlay

The green/blue 'BORA!' overlay (z-2000) was not capturing pointer events,
allowing taps to fall through to workout modal elements below. Added
onClick/onPointerDown/onTouchStart stopPropagation."
```

---

## Task 4: Corrigir destino do botão Carteira no menu

**Por que quebra hoje:** Em `IronTracksAppClientImpl.tsx` linha 702, `onOpenWallet` chama `openVipView()` — abre a tela de planos VIP do aluno. Para professores, "Carteira" deveria abrir o painel admin na aba `billing` (faturamento dos alunos). O destino errado confunde professores que tentam acessar cobranças.

**Arquivos:**
- Modificar: `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` (linha 702)

- [ ] **Step 1: Localizar a linha em IronTracksAppClientImpl.tsx**

Encontrar (linha ~702):

```tsx
onOpenWallet={() => openVipView()}
```

- [ ] **Step 2: Corrigir para abrir o painel admin na aba billing**

Substituir por:

```tsx
onOpenWallet={() => { openAdminPanel('billing'); setView('admin'); }}
```

> `openAdminPanel` e `setView` já estão no escopo — são usados na linha 538 (`handleOpenAdmin`) e linha 539. Não há import adicional necessário.

- [ ] **Step 3: TypeScript + ESLint**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npx tsc --noEmit
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs \
  "src/app/(app)/dashboard/IronTracksAppClientImpl.tsx" --max-warnings 0
```
Esperado: sem output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/IronTracksAppClientImpl.tsx"
git commit -m "fix: wallet button opens teacher billing tab instead of VIP screen

onOpenWallet was calling openVipView() which shows the student VIP plans
page. For teachers, the wallet should open the admin panel on the billing
tab where they manage student subscriptions."
```

---

## Verificação final

- [ ] **TypeScript global limpo**

```bash
cd "/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks"
npx tsc --noEmit
```

- [ ] **Deploy**

```bash
npm run deploy
```
