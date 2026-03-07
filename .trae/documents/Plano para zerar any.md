# Plano para zerar `any` no projeto

## Objetivo
Zerar o uso explícito de `any` em TypeScript dentro de `src/` (arquivos `.ts`/`.tsx`, excluindo `.d.ts`), mantendo o app compilando e funcionando.

## Princípios (para não quebrar nada)
- Trocar `any` por `unknown` + validação/narrowing sempre que a origem do dado for incerta (API, Supabase, localStorage, etc.).
- Preferir tipos existentes do projeto (`AdminUser`, `ActiveSession`, `Workout`, etc.) antes de criar novos.
- Para estruturas dinâmicas inevitáveis, usar `Record<string, unknown>` + helpers de leitura segura (ex.: `isRecord`, `asString`, `asNumber`, `asArray`).
- Não mexer em áreas “travadas” (auth) e evitar refactors colaterais grandes; atacar por módulos, com verificação contínua.

## Estratégia por fases
### Fase 0 — Baseline e trilha de auditoria
- Congelar o baseline atual de contagem de `any` e a lista de “Top 10 arquivos”.
- Definir um script/checagem de CI para impedir regressão (fail se `any_total > 0` ou se aumentar).

### Fase 1 — “Vitórias rápidas” (alto volume, baixo risco)
Atacar primeiro ocorrências simples e mecânicas:
- Substituir `: any` em handlers/eventos por tipos corretos (`React.ChangeEvent`, `React.MouseEvent`, etc.) onde aplicável.
- Substituir `as any` em casts por:
  - tipos reais existentes, ou
  - `unknown` + narrowing (type guards), ou
  - `satisfies` quando o objetivo for checar forma sem forçar cast.
- Trocar `any[]` por `unknown[]` e reduzir ao ponto de uso.

Critério de saída: reduzir substancialmente `: any` e `as any` sem tocar em lógica de negócio.

### Fase 2 — Arquivos “Top offenders” (um por vez)
Ordem sugerida (pela contagem atual):
1) `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx`
2) `src/components/AdminPanelV2.tsx`
3) `src/components/HistoryList 2.tsx`
4) `src/components/VipHub 2.tsx`
5) `src/components/dashboard/nutrition/NutritionMixer.tsx`
… e assim por diante

Para cada arquivo:
- Mapear as origens dos `any` (API/Supabase/DOM/evento).
- Criar/ajustar tipos locais mínimos (interfaces pequenas) e mover para `src/types/*` se reutilizáveis.
- Introduzir type guards específicos do domínio (ex.: `isWorkoutRow`, `isExerciseRow`) quando necessário.
- Manter o comportamento idêntico; apenas tipagem + proteção.

Critério de saída: arquivo passa a ter 0 ocorrências de `any` e continua compilando.

### Fase 3 — Normalização do “lixo legado” (arquivos com “ 2.tsx”)
- Revisar arquivos duplicados do tipo `* 2.tsx` e decidir:
  - remover dependência do app (parar de importar), ou
  - consolidar em um único arquivo tipado.

Critério de saída: duplicatas não bloqueiam o “zero any” e não são importadas sem necessidade.

### Fase 4 — Gate definitivo (para não voltar)
- Habilitar regras para bloquear `any`:
  - ESLint/TS config (`@typescript-eslint/no-explicit-any`) como erro, com exceções raras e justificadas.
  - Script de contagem no CI para garantir “0”.

## Verificação (a cada etapa)
- `npm run lint` (se existir) + `npm run build` + checagem do dashboard e painel (fluxos críticos).
- Smoke test manual: `/dashboard`, abrir “Painel de Controle”, trocar tabs, carregar listas principais.

## Riscos e como mitigamos
- Tipos em dados “semi-estruturados” (Supabase/JSON): usar `unknown` + guards em vez de “adivinhar”.
- Refactors acidentais: trabalhar arquivo por arquivo, com diffs pequenos e sem alterações de UI.

## Definição de pronto
- Contagem de `any` em `src/` chega a 0 (excluindo `.d.ts`).
- Build e navegação principal funcionando (dashboard + painel).
- Gate ativo para impedir regressão.

