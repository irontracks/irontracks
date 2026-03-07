## Entendi a função
- O botão **Aplicar no próximo treino** deve pegar a lista `ai.progression` do relatório e **anexar essas sugestões ao próximo treino (template)**.
- No treino ativo, isso precisa aparecer de forma **bem sutil** (sem virar um bloco grande de texto no modal).

## Por que está quebrado hoje
- A função `applyProgressionToNextTemplate` está como stub e sempre retorna “IA em manutenção…”, então nada é aplicado.

## Como vou implementar (sem poluir o modal)
### 1) Persistir as sugestões no próximo template
- Criar rota `POST /api/ai/apply-progression-next`.
- A rota vai:
  - `requireUser()`
  - receber `{ session, progression, historyId }`
  - descobrir o template atual via `session.originWorkoutId`
  - encontrar o **próximo treino** seguindo a mesma lógica do dashboard (lista `workouts` ordenada por `name`): pega o próximo após o `originWorkoutId`.
  - aplicar cada item de `progression` no exercício correspondente (match por nome normalizado) salvando no **primeiro set** em `advanced_config.ai_suggestion`.

**Por que em `advanced_config`?**
- Não cria coluna nova no banco e não usa `ex.notes` (que hoje aparece grande no treino ativo).
- É invisível/“técnico” no template, mas a UI consegue ler e mostrar como hint.

### 2) Fazer o botão chamar a rota
- Implementar `applyProgressionToNextTemplate` em `src/actions/workout-actions.js` para chamar `/api/ai/apply-progression-next`.
- O `WorkoutReport` já faz `setApplyState` e espera `res.templateId` — vou devolver isso certinho.

### 3) Mostrar no treino ativo de forma sutil
- Em `ActiveWorkout`, para cada exercício:
  - ler `ex.setDetails[0].advanced_config.ai_suggestion`
  - renderizar um hint discreto na linha de metadados (text-xs), algo tipo:
    - `IA: aumente 2,5kg mantendo RPE 8` (truncate)
  - ao clicar, expande/mostra o texto completo (sem virar um bloco gigante por padrão).

## Casos de borda
- Se o treino atual for o último da lista e não existir “próximo”: aplicar no próprio template e retornar mensagem clara.
- Se um exercício não tiver sets no template: criar `set_number=1` apenas para guardar a sugestão.

## Validação
- Gerar insights → clicar **Aplicar no próximo treino** → confirmar retorno “Aplicado”.
- Abrir o próximo treino e iniciar → ver os hints “IA:” aparecendo discretos.
- Rodar lint/build.
