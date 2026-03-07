# Plano - PRs por exercício (tabela dedicada)

## Objetivo
Substituir a detecção de PRs (Personal Records) no endpoint de finalizar treino por uma tabela dedicada (`exercise_personal_records`), eliminando o fetch de 160 treinos + parse de JSON do histórico em toda requisição.

## Estado Atual (problema)
Em [finish/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/workouts/finish/route.ts#L291-L381), o fluxo de PR:
- Calcula “melhor do treino atual”
- Busca os últimos 160 treinos do usuário
- Parseia `notes` (JSON) e recalcula “melhor histórico”
- Compara e notifica PRs

Isso é custoso (IO + CPU + memória) e não escala.

## Escopo
### Inclui
1. Migration SQL criando tabela `exercise_personal_records` com RLS e índices.
2. Refatoração do bloco de PR em `src/app/api/workouts/finish/route.ts` para:
   - Calcular PRs apenas do treino atual
   - Consultar PRs já persistidos para os exercícios relevantes (1 query)
   - Upsert apenas quando houver melhoria real, preservando valores anteriores
   - Manter notificação de PRs para seguidores usando os dados do treino atual
3. Validação com build/testes existentes do repositório.

### Não inclui
- Mudanças em schema de workouts/exercises existentes
- Mudanças no payload do endpoint
- Alterações na UI
- “Reprocessamento” de PRs antigos (backfill), a menos que você peça depois

## Abordagem Técnica

### Passo 1 — Migration SQL
Criar arquivo:
`supabase/migrations/20260220120000_exercise_personal_records.sql`

Conteúdo exatamente como especificado:
- `exercise_personal_records (user_id, exercise_name)` como PK composta
- colunas `best_weight`, `best_reps`, `best_volume`
- `workout_id`, `achieved_at`, `updated_at`
- RLS habilitado
- Policy de leitura para o próprio usuário
- Policy de acesso total para service role
- Índice `idx_prs_user_id`

### Passo 2 — Refatorar PRs em `finish/route.ts`
Substituir o bloco atual (que faz `.limit(160)` + parse de `notes`) por:

0. **Manter o throttling exatamente como hoje**
   - O bloco inteiro de PR (busca dos PRs atuais + comparação + upsert + notificação) continua dentro do mesmo `try { ... const throttlePr = ...; if (!throttlePr) { ... } } catch {}`.
   - Não mover a checagem `if (!throttlePr)` para fora nem dividir o bloco em partes fora desse `if`.

1. **Calcular o melhor do treino atual**
   - Reusar `buildBestByExerciseFromSession(sessionObj)` (já existe no arquivo).
   - Se `currentBest.size === 0`, não faz nada.

2. **Buscar PRs existentes apenas para os exercícios do treino atual (1 query)**
   - Montar `exerciseNames = Array.from(currentBest.keys())`
   - Query:
     - `admin.from('exercise_personal_records')`
     - `.select('exercise_name, best_weight, best_reps, best_volume')`
     - `.eq('user_id', user.id)`
     - `.in('exercise_name', exerciseNames)`

3. **Comparar em memória e preparar UPSERT somente dos que melhoraram**
   - Para cada exercício do treino atual:
     - `prev = mapPrev.get(exercise_name)` (se não existir, considera 0)
     - Normalizar NUMERIC do Supabase antes de comparar:
       - `prevWeight = Number(row.best_weight ?? 0)`
       - `prevReps = Number(row.best_reps ?? 0)`
       - `prevVolume = Number(row.best_volume ?? 0)`
     - `nextBestWeight = max(prev.best_weight, cur.weight)`
     - `nextBestReps = max(prev.best_reps, cur.reps)`
     - `nextBestVolume = max(prev.best_volume, cur.volume)`
   - Só incluir no upsert se **qualquer um** dos “next” for maior que o “prev” (melhoria real).
   - Importante: construir payload já com valores “max”, para nunca sobrescrever PR por um valor menor.
   - Payload incluir:
     - `user_id`, `exercise_name`
     - `best_weight`, `best_reps`, `best_volume` (já maximizados)
     - `workout_id: saved?.id ?? null`
     - `achieved_at` e `updated_at` (ISO string atual)

4. **Executar upsert**
   - Apenas se a lista de melhorias tiver itens:
     - `.upsert(rows, { onConflict: 'user_id, exercise_name', ignoreDuplicates: false })`

5. **Notificação de PRs para seguidores (sem histórico)**
   - Reutilizar `currentBest` e os `prev` consultados para decidir se houve PR.
   - Manter a mesma priorização existente por exercício:
     - Se bateu volume PR → notificar volume
     - Else se bateu weight PR → notificar carga
     - Else se bateu reps PR → notificar reps
   - Continuar usando throttle existente (`shouldThrottleBySenderType(..., 'friend_pr', 60)`), preferências e `insertNotifications`.

6. **Remover completamente**
   - O fetch `.from('workouts')...limit(160)`
   - O parse de `notes` e `buildBestByExerciseFromSession` aplicado ao histórico

## Validação (pós-implementação)
- Rodar `npm run build` para garantir que o TypeScript e o build do Next passam.
- Rodar o smoke test já existente do projeto (ex.: `npm run test:smoke`) para garantir que o endpoint não quebrou.
- Revisar rapidamente o bloco de PRs para garantir:
  - 1 query para buscar PRs atuais por `exercise_name IN (...)`
  - 0 queries para buscar histórico de workouts
  - Notificação ainda baseada no treino atual e preservando throttling/preferências

## Critérios de Aceite
- A migration cria a tabela com as policies e índice conforme especificado.
- `finish/route.ts` não faz mais `.limit(160)` nem parse de `notes` para PR.
- PRs passam a ser persistidos em `exercise_personal_records` e só atualizam quando melhoram.
- Notificações de PR continuam sendo enviadas, usando a comparação com PRs persistidos.
- Build (`npm run build`) passa.

## Riscos / Cuidados
- Conversão de `NUMERIC` do Supabase (pode vir como string). Normalizar sempre com `Number(row.best_weight ?? 0)` / `Number(row.best_reps ?? 0)` / `Number(row.best_volume ?? 0)` antes de comparar.
- Garantir que `exercise_name` seja estável (mesma string). Se houver variação de capitalização/acentuação, pode gerar chaves diferentes; não vou alterar normalização agora (fora do escopo), mas vale considerar depois.
