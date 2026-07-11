-- Hardening da auditoria do professor (defesa em profundidade — nada explorável hoje).

-- 1) Revoga escrita de authenticated/anon nas tabelas cujas escritas são 100% service-role
-- (default-deny: sem policy permissiva de escrita hoje). Remove a superfície caso alguém
-- adicione uma policy de escrita por engano no futuro. Verificado: marketplace via webhook
-- Asaas, teacher_tiers é seed, coach_inbox_states só grava via /api/teacher/inbox/action
-- (createAdminClient). SELECT permanece.
revoke insert, update, delete on public.marketplace_payments from authenticated, anon;
revoke insert, update, delete on public.marketplace_subscriptions from authenticated, anon;
revoke insert, update, delete, truncate on public.teacher_tiers from authenticated, anon;
revoke insert, update, delete on public.coach_inbox_states from authenticated, anon;

-- 2) appointments: a policy permissiva appointments_insert_own (with_check
-- student_id=auth.uid OR coach_id=auth.uid) deixava um usuário inserir uma appointment com
-- student_id=self e coach_id=<professor arbitrário> → poluía o calendário de um professor
-- com quem não tem vínculo (spoofing, sem vazamento). Dropada: a criação legítima é do
-- COACH via coaches_manage_own_appointments (with_check coach_id=auth.uid — ScheduleClient
-- sempre insere coach_id=userId com aluno da própria lista) e o aluno continua LENDO os
-- seus via appointments_select_own. Nenhum fluxo de insert do lado do aluno existe hoje.
drop policy if exists appointments_insert_own on public.appointments;

-- 3) teachers: a policy de SELECT tinha o email de admin HARDCODED ('djmkapple@gmail.com')
-- como super-leitor, divergindo da fonte de verdade do admin (is_admin() / profiles.role).
-- Troca por is_admin() — unifica a identidade de admin e remove o code-smell.
drop policy if exists teachers_select_self_or_admin on public.teachers;
create policy teachers_select_self_or_admin on public.teachers
  for select to authenticated
  using ((email = (auth.jwt() ->> 'email')) or public.is_admin());
