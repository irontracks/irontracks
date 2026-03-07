# Prompts de Melhoria — IronTracks
> Gerado em 2026-02-18. Execute um por vez e faça commit entre cada um.

---

## PROMPT 1 — Quebrar AdminPanelV2.tsx em sub-componentes

```
O arquivo src/components/AdminPanelV2.tsx tem ~461KB e é um componente monolítico.
Refatore-o dividindo em sub-componentes separados por aba/seção dentro de src/components/admin/.
Cada sub-componente deve ter sua própria responsabilidade.
Regras:
- Mantenha toda a lógica existente intacta (não mude comportamento)
- Cada sub-componente deve ser .tsx com props tipadas via interface TypeScript
- O AdminPanelV2.tsx deve ficar como um "orquestrador" que importa os sub-componentes
- Não adicione funcionalidades novas
- Não altere nenhuma chamada de API ou lógica de estado existente
```

---

## PROMPT 2 — Quebrar ActiveWorkout.tsx em sub-componentes

```
O arquivo src/components/ActiveWorkout.tsx tem ~204KB e é um componente monolítico crítico.
Refatore-o dividindo em sub-componentes dentro de src/components/workout/.
Sugestão de divisão: ExerciseList, SetInputRow, RestTimerOverlay, WorkoutHeader, WorkoutFooter.
Regras:
- Mantenha toda a lógica existente intacta (não mude comportamento)
- Cada sub-componente deve ser .tsx com props tipadas via interface TypeScript
- Preserve todos os hooks, estado e callbacks existentes
- O ActiveWorkout.tsx deve ficar como orquestrador principal
- Não adicione funcionalidades novas
```

---

## PROMPT 3 — Eliminar `any` em HistoryList.tsx com Zod

```
O arquivo src/components/HistoryList.tsx tem 19 ocorrências de `any`.
Substitua todos os `any` por tipos TypeScript corretos ou schemas Zod onde há parse de dados externos.
Regras:
- Use z.infer<typeof Schema> para inferir tipos dos schemas existentes em src/schemas/database.ts
- Onde não houver schema, crie interfaces TypeScript explícitas
- Não mude a lógica de negócio, apenas os tipos
- Não use type assertions (as X) sem validação prévia
- Após a alteração, confirme que não há erros de TypeScript no arquivo
```

---

## PROMPT 4 — Eliminar `any` em StudentDashboard3.tsx com Zod

```
O arquivo src/components/dashboard/StudentDashboard3.tsx tem ~40 ocorrências de `any`.
Substitua todos os `any` por tipos TypeScript corretos ou schemas Zod.
Regras:
- Use os schemas existentes em src/schemas/database.ts como base
- Para dados vindos de API (Supabase), use z.infer<typeof WorkoutSchema>, z.infer<typeof ExerciseSchema>, etc.
- Onde não há schema adequado, crie interfaces TypeScript no mesmo arquivo ou em src/types/
- Preserve toda a lógica de negócio
- Confirme ausência de erros TypeScript após a alteração
```

---

## PROMPT 5 — Padronizar interfaces snake_case / camelCase

```
No projeto IronTracks, vários arquivos em src/types/ têm interfaces com propriedades duplicadas em snake_case e camelCase simultaneamente (ex: video_url e videoUrl na mesma interface).
Isso ocorre porque o Supabase retorna snake_case mas o app usa camelCase internamente.

Faça o seguinte:
1. Em src/schemas/database.ts, adicione .transform() nos schemas Zod para converter snake_case → camelCase automaticamente
2. Nos arquivos src/types/app.ts e src/types/assessment.ts, remova as propriedades duplicadas mantendo apenas camelCase
3. Nos locais que consomem dados do Supabase diretamente, garanta que os dados passem pelo schema Zod antes de serem usados no componente
Regras:
- Não quebre nenhuma funcionalidade existente
- Faça as alterações gradualmente, começando pelos tipos mais simples
- Teste mental: após a mudança, nenhuma propriedade deve ter dois nomes diferentes na mesma interface
```

---

## PROMPT 6 — Adicionar Zod nos componentes que recebem dados dinâmicos

```
No IronTracks, a validação com Zod está bem aplicada nas rotas API (src/app/api/) mas ausente nos componentes React que processam dados dinâmicos.
Identifique os 5 componentes com mais type assertions manuais (ex: (x as Record<string, unknown>)) e substitua por safeParse() do Zod.

Regras:
- Use os schemas existentes em src/schemas/database.ts
- Substitua padrões como:
  ANTES: const ex = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
  DEPOIS: const parsed = ExerciseSchema.safeParse(ex); const ex = parsed.success ? parsed.data : null
- Não adicione validação em dados que já foram validados na API
- Priorize componentes: ActiveWorkout.tsx, HistoryList.tsx, StudentDashboard3.tsx
```

---

## PROMPT 7 — Configurar Vitest para testes unitários

```
O projeto IronTracks não tem framework de testes unitários configurado (só tem scripts smoke com tsx).
Configure o Vitest com React Testing Library para testes unitários.

O que fazer:
1. Instale: vitest, @vitest/ui, @testing-library/react, @testing-library/jest-dom, jsdom, @types/testing-library__jest-dom
2. Crie vitest.config.ts na raiz com environment: 'jsdom' e setup adequado
3. Adicione o script "test:unit": "vitest run" no package.json
4. Crie 3 testes iniciais como exemplo:
   - src/lib/nutrition/__tests__/engine.test.ts — testa a função de cálculo calórico
   - src/utils/__tests__/workoutTitle.test.ts — testa normalização de títulos
   - src/utils/calculations/__tests__/bodyComposition.test.ts — testa cálculos de composição corporal
5. Não altere os scripts smoke existentes
```

---

<br>

---

> **Ordem recomendada de execução:** 7 → 3 → 4 → 6 → 5 → 2 → 1
>
> Prompts 1 e 2 são os mais arriscados — execute por último e revise manualmente antes de commit.
