## Situação atual (por que isso é perigoso)
- Se você está vendo o **“Treino A” da aluna Karol** na aba **Treinos**, isso significa que o item da lista é um registro na tabela `workouts` cujo `user_id` é da Karol.
- Se esse registro for deletado, **o treino some para ela também**, porque não é “um atalho”: é o próprio treino dela.

## Objetivo
- Garantir que **na aba Treinos** você só consiga apagar **templates do próprio usuário (coach/admin)**, e que **nunca** apague treinos de aluno por acidente.
- Manter a capacidade do **admin deletar qualquer coisa**, mas em um fluxo **separado e explícito** (não misturado na aba Treinos).

## Mudanças que vou implementar
### 1) Aba Treinos: listar apenas templates do usuário logado
- Ajustar a origem da lista para NÃO trazer cópias sincronizadas de alunos:
  - Alterar `/api/admin/workouts/mine` para filtrar somente `.eq('user_id', user.id)` (mantendo `is_template=true`).
  - Ajustar o fallback no `AdminPanelV2` para usar o mesmo filtro (sem `.or(created_by..., user_id...)`).

### 2) Aba Treinos: bloquear delete se aparecer treino que não é “seu” (defesa extra)
- Mesmo que por algum motivo um treino de aluno chegue na lista, o botão de excluir:
  - fica desabilitado, ou
  - exige um “modo admin perigoso” (toggle + confirmação forte), e por padrão não deixa.

### 3) Admin delete-any: mover para fluxo explícito (sem risco)
- Criar/ajustar um endpoint/admin action “delete-any” separado (ex.: `/api/admin/workouts/delete-any`) que:
  - só permite `role=admin`
  - exige confirmação forte no payload (ex.: `confirm: true` + `reason`)
  - faz cascade delete
- A UI de “delete-any” fica em outro lugar (ex.: dentro do detalhe do aluno ou uma seção “Admin / Perigoso”), não na aba Treinos.

## Validação
- Como admin, abrir aba Treinos e confirmar que **Treino A da Karol não aparece mais**.
- Excluir um template seu e verificar que some só da sua lista.
- (Opcional) Testar o fluxo “admin delete-any” separado e confirmar que só funciona com confirmação forte.
- Rodar `npm run build`.

Observação rápida: vi uma `YOUTUBE_API_KEY` no `.env.local`. Garanto que não vou logar/replicar esse valor; recomendo rotacionar se tiver ido para GitHub acidentalmente.