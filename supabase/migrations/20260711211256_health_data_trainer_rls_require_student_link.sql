-- CRÍTICO (auditoria de dados de saúde, 2026-07-11): vazamento cross-user de dado médico.
-- As policies de "trainer" de assessments/body_photo_assessments/lab_exams amarravam SÓ
-- trainer_id = auth.uid(), sem validar vínculo em students, e sem trigger/constraint. Logo
-- qualquer usuário autenticado inseria uma linha {user_id: VÍTIMA, trainer_id: self} — a RLS
-- aprovava — e as rotas de IA (body-composition-correlation/photo, lab-exam-protocol) que
-- confiam em row.trainer_id passavam a puxar labs/avaliações/nutrição/perfil da vítima via
-- admin client. Também permitia PLANTAR exames/avaliações falsos na conta da vítima
-- (a vítima vê pela policy de dono user_id=auth.uid). Correção: exigir vínculo real
-- (students.user_id = <tabela>.user_id AND students.teacher_id = auth.uid()) — o mesmo que
-- canCoachStudent já pressupõe. As policies de DONO (autoavaliação) ficam intactas.

-- body_photo_assessments
drop policy if exists body_photo_assessments_trainer on public.body_photo_assessments;
create policy body_photo_assessments_trainer on public.body_photo_assessments for all to public
  using (auth.uid() = trainer_id and exists (select 1 from public.students s where s.user_id = body_photo_assessments.user_id and s.teacher_id = auth.uid()))
  with check (auth.uid() = trainer_id and exists (select 1 from public.students s where s.user_id = body_photo_assessments.user_id and s.teacher_id = auth.uid()));

-- lab_exams
drop policy if exists lab_exams_trainer on public.lab_exams;
create policy lab_exams_trainer on public.lab_exams for all to public
  using (auth.uid() = trainer_id and exists (select 1 from public.students s where s.user_id = lab_exams.user_id and s.teacher_id = auth.uid()))
  with check (auth.uid() = trainer_id and exists (select 1 from public.students s where s.user_id = lab_exams.user_id and s.teacher_id = auth.uid()));

-- assessments: dropa as 3 policies redundantes de trainer (INSERT/UPDATE/DELETE separadas —
-- todas permissivas, então qualquer uma delas sozinha reabriria a forja) + reconstrói a ALL
-- com o vínculo. As policies de dono/aluno (user_id/student_id = auth.uid) NÃO são tocadas.
drop policy if exists "Authenticated insert as trainer" on public.assessments;
drop policy if exists "Authenticated manage own trainer assessments" on public.assessments;
drop policy if exists "Authenticated delete own trainer assessments" on public.assessments;
drop policy if exists "Trainers manage student assessments" on public.assessments;
create policy "Trainers manage student assessments" on public.assessments for all to public
  using (trainer_id = auth.uid() and exists (select 1 from public.students s where s.user_id = assessments.user_id and s.teacher_id = auth.uid()))
  with check (trainer_id = auth.uid() and exists (select 1 from public.students s where s.user_id = assessments.user_id and s.teacher_id = auth.uid()));
