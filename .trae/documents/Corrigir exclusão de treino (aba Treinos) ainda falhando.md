## Diagnóstico
- O erro “Você só pode excluir seus próprios treinos.” vem da Server Action `deleteWorkout(id)`, que hoje só permite deletar quando `workout.user_id === user.id`.
- No painel (aba Treinos), a listagem inclui também treinos que foram **criados pelo coach para alunos** (cópias sincronizadas), então `user_id` é do aluno e a action barra.

## Correções que vou implementar
### 1) Admin pode deletar qualquer treino
- Em `deleteWorkout(id)`:
  - Resolver o role do usuário logado (admin/teacher/user) usando `resolveRoleByUser`.
  - Se for **admin**, permitir deletar qualquer workout (template ou não), usando **admin client (service role)** e fazendo cascade delete (sets → exercises → workout).
  - Se o workout deletado for um template “fonte”, também remover as cópias sincronizadas via `deleteTemplateFromSubscribers` usando o `created_by` correto.
  - Manter retorno estruturado `{ success, error }` (sem estourar erro genérico do Next).

### 2) (Opcional, mas recomendado) Não listar cópias de alunos na aba Treinos para teacher
- Ajustar o carregamento da aba Treinos (AdminPanelV2 + `/api/admin/workouts/mine`) para listar por padrão apenas `user_id = currentUser.id`.
- Se você quiser manter visível a cópia sincronizada, eu deixo aparecendo mas com label “cópia de aluno” e delete só para admin.

## Validação
- Logar como admin e deletar:
  - um template próprio
  - um template de outro usuário
  - um treino não-template (se aparecer na lista)
- Confirmar que não aparece mais o erro de ownership e que a lista atualiza.
- Rodar `npm run build`. 
