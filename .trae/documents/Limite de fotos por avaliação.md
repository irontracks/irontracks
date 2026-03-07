A ideia é excelente e muito “high leverage” pro coach: reduz fricção (não precisa abrir aluno por aluno), aumenta retenção (churn) e segurança (picos de carga), e ainda transforma dados em ação com mensagens prontas.

O que eu gostei (e por que faz sentido no seu app)
- Vocês já têm os dados essenciais: treinos (workouts/exercises/sets), agenda (appointments) e chat (direct_messages/direct_channels). Isso permite detectar churn/queda de volume/picos de carga sem inventar muita coisa.
- O app já tem um “teacher dashboard” na prática: o Painel de Controle [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js) e inclusive já existe um bloco chamado “Coach Inbox” dentro do dashboard do painel. A ideia encaixa naturalmente virando uma aba dedicada “Prioridades”.

Pontos de atenção (pra não prometer mais do que o banco entrega hoje)
- “PRs” não existe como feature dedicada no código atual. Dá para começar com heurísticas de progresso (ex.: top set maior do que últimas X semanas) e só depois evoluir para PR real.
- Existe indício de drift: o código usa `workouts.completed_at`, mas não há migration correspondente no repo. Para métricas confiáveis, vamos basear em `workouts.date/created_at` e `sets.completed`.
- Chat global usa `messages/channel_id`, mas parte do schema de canais/membros não está no repo; para inbox vamos focar em DM (`direct_*`) + dados de treino/agenda.

## Plano de Implementação

## 1) Definir o “modelo de evento” da Inbox
- Criar um tipo de evento único (ex.: `CoachInboxItem`) com:
  - `student_id`, `student_name`, `severity` (low/med/high)
  - `type` (churn_risk | volume_drop | load_spike | upcoming_appointment | missing_checkin)
  - `reason` (texto curto: “14 dias sem treino”, “-32% volume semana a semana”, “pico de carga +45%”) 
  - `suggested_message` (texto pronto) e `ai_summary` (explicação curta do porquê)
  - `cta` (abrir aluno, abrir histórico, abrir chat)

## 2) Backend: endpoint seguro que gera o feed por coach
- Criar um endpoint/route do Next (ex.: `GET /api/coach/inbox`) protegido por `requireRole(['teacher'])`.
- Segurança/RLS:
  - Para cada aluno incluído, validar vínculo `students.teacher_id = auth.user.id` (mesma lógica de [workouts/history](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/admin/workouts/history/route.ts#L42-L50)).
  - Usar o supabase server (do usuário) para respeitar RLS e evitar vazamento cross-teacher.

## 3) Heurísticas v1 (rápidas e úteis)
- Churn (sumindo):
  - `days_since_last_workout` usando `workouts.date` (is_template=false) e/ou `workouts.created_at`.
  - Regras exemplo: 7+ dias (médio), 14+ dias (alto), 21+ dias (crítico).
- Queda de volume:
  - Calcular “tonnage” aproximado por semana: soma de `weight * reps_num` em `sets.completed=true` e `is_warmup=false`.
  - Comparar semana atual vs anterior (ou últimos 7 vs 7 anteriores). Alertar se cair > X%.
- Pico de carga (risco de lesão):
  - “Acute vs chronic”: volume 7 dias / média 28 dias (ratio). Alertar se ratio > 1.5 (configurável).
- Mensagens recentes (engajamento):
  - `direct_channels.last_message_at` e/ou último `direct_messages.created_at` por aluno.
  - Ex.: aluno sumiu no treino e também não responde há 10 dias.
- Agenda:
  - Próximos appointments do coach (ex.: próximas 24–72h) para lembrar follow-up.

## 4) Gemini: gerar mensagem e resumo sem quebrar RLS
- Para cada item (ou top N por execução), montar um “contexto mínimo”:
  - Nome do aluno, último treino (data), tendência (volume/ratio), último contato (data), objetivo (se existir no profile), próxima consulta (se existir).
- Chamar Gemini com prompt fixo:
  - Output estruturado: `{ message: string, summary: string }`
  - Regras: tom profissional/curto, sem dados sensíveis, sem inventar.
- Cache/limites:
  - Só gerar IA para os itens visíveis (top 10) ou sob demanda (botão “Gerar mensagem”).

## 5) UI: nova aba “Prioridades” no TeacherDashboard (AdminPanelV2)
- Implementar a aba dentro do Painel de Controle [AdminPanelV2.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/AdminPanelV2.js):
  - Adicionar tab `priorities` em `TAB_LABELS` e no seletor.
  - Listar cards com: aluno, motivo, severidade, preview da mensagem, botões “Copiar” e “Enviar no chat”.
- Envio:
  - Reusar o fluxo de chat direto já existente (ou abrir a conversa e preencher a mensagem para o coach revisar).
  - Se DM estiver bloqueado por preferências (`allowDirectMessages=false`), mostrar fallback “Abrir aluno”/“Criar mensagem manual”.

## 6) Performance e robustez
- v1 pode ser “compute on request” (server-side) com limites (ex.: 50 alunos, 200 workouts por aluno é pesado).
- Se ficar lento:
  - Introduzir uma tabela de “coach_inbox_cache” por coach com refresh periódico (cron) ou refresh manual.
  - Alternativamente, uma view/materialized view agregando volume por dia.

## 7) Validação
- Validar que um teacher só vê alunos vinculados.
- Validar que os cálculos batem com o histórico de treinos.
- Testar o fluxo “Copiar/Enviar” e o fallback quando DM está bloqueado.

Se você confirmar este plano, eu parto para a implementação v1 (aba Prioridades + endpoint + heurísticas churn/volume/pico + geração opcional via Gemini).