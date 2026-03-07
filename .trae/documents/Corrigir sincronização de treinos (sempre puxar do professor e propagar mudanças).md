## Diagnóstico (causa mais provável)
- O fluxo do botão chama [/api/admin/workouts/sync-templates](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/workouts/sync-templates/route.ts), que sincroniza corretamente via [syncAllTemplatesToSubscriber](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/lib/workoutSync.ts#L195-L241) (puxa somente templates do professor e grava clones no aluno).
- Porém, depois a UI e a rota recarregam treinos do aluno com um `OR user_id/student_id` (coluna `student_id` nem aparece nas migrations do repo), o que pode “misturar” treinos de outras pessoas/alunos e fazer parecer que o sync puxou treino errado.
- Além disso, há divergência de modelagem/RLS: a migration [rls_students_workouts_exercises.sql](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/supabase/migrations/rls_students_workouts_exercises.sql#L49-L105) assume `workouts.user_id = students.id`, enquanto o projeto já tem `students.user_id` e lógica de sync trabalhando com `auth.users(id)`. Isso é um terreno fértil para leituras erradas.

## Objetivo
- “Sincronizar meus treinos” deve sempre usar templates do professor logado.
- O aluno deve receber clones vinculados ao template fonte e qualquer edição do professor deve refletir em todos os alunos sincronizados.
- Evitar que alunos alterem o clone sincronizado (para não divergir da fonte).

## Mudanças no Backend (rota de sync)
1. Ajustar [/api/admin/workouts/sync-templates](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/workouts/sync-templates/route.ts) para:
   - Resolver `targetUserId` somente para um **auth uid** válido (profiles.id ou students.user_id). Se não existir, retornar erro claro (“Aluno sem conta/convite; não é possível sincronizar”).
   - Remover o `.or(user_id.eq.X,student_id.eq.X)` nas consultas de `existing` e `rows`, substituindo por `.eq('user_id', targetUserId)`.
   - Garantir que a listagem pós-sync retorne apenas templates do alvo correto.

## Mudanças no Frontend (AdminPanelV2)
2. Ajustar o botão em [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js#L2374-L2441) para:
   - Usar `targetUserId = selectedStudent.user_id` como fonte principal; se ausente, chamar a rota apenas com `email` (sem fallback para `selectedStudent.id`).
   - Remover o fallback de recarregar via `.or(user_id.eq.${targetId},student_id.eq.${targetId})` (ou trocar por `.eq('user_id', targetUserId)`), para não buscar “treinos de outra pessoa”.
   - Classificar “Treinos sincronizados” de forma mais determinística: `created_by === user.id` **e** `user_id === targetUserId` (e, quando existir, priorizar `source_workout_id != null`).

## Corrigir/Unificar RLS (para sync contínuo funcionar de verdade)
3. Criar uma migration nova de RLS para `workouts/exercises/sets` que reflita o comportamento desejado:
   - **SELECT**: permitir para o dono (`workouts.user_id = auth.uid()`), para admin, e para o professor do aluno via `students.user_id = workouts.user_id`.
   - **UPDATE/DELETE**: permitir apenas para quem criou (`COALESCE(workouts.created_by, workouts.user_id) = auth.uid()`) ou admin.
   - Exercícios/séries: mesmas regras, derivadas do workout.
   - Resultado: aluno consegue ver o clone sincronizado (porque `user_id` é dele), mas não consegue editar (porque `created_by` é do professor).

## Verificação (após implementar)
4. Validar com 2 alunos + 1 professor:
   - Sincronizar no aluno A e confirmar que só aparecem templates do professor.
   - Sincronizar no aluno B e confirmar que não “vaza” treino do aluno A.
   - Editar um template do professor e confirmar que ambos alunos atualizam automaticamente (via `source_workout_id` + subscriptions).

## Entregáveis
- Correção do bug de “puxar treino de aluna” (queries do target ficam isoladas por `user_id`).
- Sync contínuo confiável: mudanças do professor propagam e aluno não sobrescreve clones.
- Migration de RLS consistente com o modelo atual (students.user_id + auth uid).
