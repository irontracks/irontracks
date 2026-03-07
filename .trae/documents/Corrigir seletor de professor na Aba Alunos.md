## Diagnóstico (o que está acontecendo)
- O seletor de professor fica em [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js#L2662-L2722) e chama o endpoint [assign-teacher route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/admin/students/assign-teacher/route.ts#L7-L70).
- Hoje o `<option>` usa `value={t.email ? email : (t.user_id ? uid:... : '')}`. Quando o professor não tem `email` e nem `user_id`, o `value` vira `""` (igual a “Sem Professor”), então ao selecionar ele “cai” imediatamente para sem professor.
- Mesmo quando há `email`, a API só consegue persistir se ela resolver para um `profiles.id` (auth uid). Se não resolver, ela atualiza `teacher_id` para `null` e retorna `{ ok: true, teacher_user_id: null }`, o que faz a UI voltar para “Sem Professor”.

## Correção proposta
### 1) Tornar o dropdown determinístico (UI)
- Alterar o select para trabalhar apenas com **UID** como value (ex.: `uid:${t.user_id}`), nunca com email.
- Para professores sem `user_id` resolvido (sem conta/perfil), mostrar opção **desabilitada** (disabled) para não permitir selecionar algo que o backend não consegue salvar.
- Manter “Sem Professor” com `value=""`.

### 2) Endurecer a API para não desatribuir silenciosamente
- No endpoint `assign-teacher`, quando vier `teacher_email` mas não conseguir resolver `teacher_user_id`, retornar `{ ok: false, error: 'teacher profile not found' }` (status 404/400) em vez de salvar `teacher_id = null`.
- Isso evita o comportamento “seleciono X e ele volta sozinho”.

### 3) Ajuste auxiliar (opcional, se necessário)
- Se a lista de professores está vindo da tabela `teachers` sem `email`, considerar enriquecer via `profiles`/`asaas` ou exigir email na criação do professor. (Sem isso, não dá para resolver `user_id`.)

## Validação
- No painel Admin → Aba Alunos: selecionar Belmiro / Gabriel / djmkbrasil e confirmar que:
  - o select permanece no valor escolhido;
  - `students.teacher_id` muda para o UID correto;
  - refresh da lista (`/api/admin/students/list`) mantém a seleção.
