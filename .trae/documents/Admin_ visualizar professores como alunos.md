## Resposta direta
- Dá para fazer exatamente o que você pediu: **admin abrir um professor** e ver **tudo** relacionado aos alunos dele, incluindo **treinos (templates)** e **histórico de treinos (executados)**, além das **interações**.
- Hoje o sistema já tem a base: alunos têm `teacher_id` (id do professor) e o admin já tem APIs de treinos/histórico por aluno.

## O que vamos entregar (escopo admin-only)
### Visão “Professor (Admin)” com 4 abas
1) **Alunos**: lista de alunos atribuídos ao professor + atalho para abrir o detalhe do aluno.
2) **Treinos**: visão dos treinos/templates (is_template=true) dos alunos do professor.
3) **Histórico**: visão do histórico de treinos executados (is_template=false) de todos os alunos do professor.
4) **Interações**: visão do “Coach Inbox” do professor (os alertas e ações que ele tem com os alunos).

## Como implementar (passo a passo)
### 1) Criar “detalhe do professor” no AdminPanel
- No [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js), adicionar estado `selectedTeacher` e UI de detalhe.
- Ao clicar no card do professor (aba Professores), abrir o painel do professor com as abas acima.

### 2) Criar endpoints admin para dados do professor
Todos com `requireRole(['admin'])` e `createAdminClient()`.
- `GET /api/admin/teachers/students?teacher_user_id=...`
  - retorna alunos (`students`) onde `teacher_id = teacher_user_id`.
- `GET /api/admin/teachers/workouts/templates?teacher_user_id=...&limit=...&cursor=...`
  - retorna treinos `workouts` com `is_template=true` para `user_id in (alunos do professor)`.
  - incluir `student_name`/`student_user_id` no payload para o admin filtrar por aluno.
- `GET /api/admin/teachers/workouts/history?teacher_user_id=...&limit=...&cursor=...`
  - retorna treinos `workouts` com `is_template=false` para `user_id in (alunos do professor)` ordenado por data.
- `GET /api/admin/teachers/inbox?teacher_user_id=...`
  - replica a lógica do [teacher/inbox/feed](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/teacher/inbox/feed/route.ts), mas usando o `teacher_user_id` selecionado em vez do usuário logado.

### 3) UI das abas (AdminPanel)
- **Alunos**: tabela/card list com botão “Abrir aluno” (reaproveita o detalhe atual do aluno).
- **Treinos**: lista agrupada por aluno (com filtro por aluno).
- **Histórico**: feed de treinos executados com filtro por aluno e paginação.
- **Interações**: lista de itens do inbox do professor (somente visualização no começo; se você quiser, adiciono também ações “snooze/done/enviar msg” em endpoints admin equivalentes).

### 4) Performance e segurança
- Paginação por `limit/cursor` nos endpoints de treinos/histórico.
- Restrições fortes: **somente admin**.
- Sem duplicar telas: o detalhe do aluno existente continua sendo a forma de “ver profundo” cada aluno.

## Extra (opcional, fase 2)
- “Ver chat completo professor ↔ aluno”: requer criar endpoints admin próprios para ler channels/messages com service role (porque os endpoints atuais respeitam RLS do usuário logado).

## Entrega esperada
- Admin abre **Professores → clica no professor → vê Alunos/Treinos/Histórico/Interações** e consegue auditar tudo.
