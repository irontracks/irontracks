## Diagnóstico
- Na aba **Treinos** do painel, o botão de excluir chama a Server Action **deleteWorkout(id)** ([workout-actions.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L1315-L1350)).
- Essa action faz um check rígido: só deixa excluir quando `workout.user_id === user.id`. Se não for dono, ela dá `throw` (“Você só pode excluir seus próprios treinos.”). Em produção, esse `throw` costuma virar aquele alerta genérico de Server Components (como no seu print).
- O problema é que a listagem de “templates” do painel vem de **/api/admin/workouts/templates-list** e hoje ela mistura:
  - templates do coach (`user_id = coach`)
  - **cópias sincronizadas** criadas pelo coach para alunos (`created_by = coach`, mas `user_id = aluno`)
  - Isso acontece por causa do filtro `.or(created_by.eq.user.id, user_id.eq.user.id)` em [templates-list/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/admin/workouts/templates-list/route.ts#L16-L22)
- Resultado: você tenta excluir um “treino” que parece seu na UI, mas na verdade pertence ao aluno (`user_id != coach`), e a action explode.

## Correção (o que vou implementar)
### 1) Ajustar a listagem da aba Treinos
- Alterar **/api/admin/workouts/templates-list** para retornar **apenas templates de fato do usuário logado**:
  - manter `.eq('is_template', true)`
  - trocar o `.or(...)` por `.eq('user_id', user.id)`
- Assim a lista não inclui cópias sincronizadas de alunos, e o delete deixa de cair no check de ownership.

### 2) Evitar erro genérico ao excluir (melhor UX)
- Alterar `deleteWorkout(id)` para **não dar throw** em casos esperados (ex.: não é dono).
- Em vez disso, retornar `{ success: false, error: '...' }`.
- No AdminPanel, tratar essa resposta e exibir um alerta claro, sem derrubar a renderização.

### 3) (Opcional) Padronizar delete via endpoint admin
- Se a aba Treinos também estiver usando `/api/admin/workouts/delete` em algum fluxo, endurecer o endpoint para:
  - usar **admin client (service role)** após validar `requireRole`
  - fazer **cascade delete** (sets → exercises → workouts) como já é feito na action
  - retornar erro explícito quando tentar apagar algo que não é template

## Validação
- No painel → aba Treinos:
  - excluir um template “normal” e confirmar remoção da lista sem erro
  - confirmar que treinos sincronizados (de aluno) não aparecem mais na lista (ou aparecem como não-excluíveis, se preferirmos)
- Rodar `npm run build` para garantir que não quebre nada.
