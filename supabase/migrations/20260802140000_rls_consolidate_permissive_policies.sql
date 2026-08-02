-- Consolidação de policies RLS permissivas duplicadas (perf, ago/2026).
--
-- O advisor acusava 208 warns de multiple_permissive_policies: o Postgres
-- avalia TODAS as policies permissivas de uma ação em CADA query — pares
-- owner/trainer e own/silo dobravam o custo de RLS nas tabelas mais quentes.
--
-- REGRA DA CONSOLIDAÇÃO (equivalência mecânica, sem julgamento):
-- policies permissivas do mesmo comando se combinam com OR — então mesclar
-- N policies numa única com `USING (a) OR (b)` é IDENTIDADE semântica.
-- Os predicados abaixo são o OR LITERAL dos originais, sem simplificação.
--
-- Sobre TO authenticated nos merges que eram TO public: anon nunca satisfazia
-- nenhum predicado (todos exigem auth.uid(), que é NULL sem sessão) e
-- service_role tem BYPASSRLS — efeito idêntico, e o advisor para de contar
-- sobreposição public×authenticated.
--
-- Ordem segura: CREATE da mesclada antes do DROP das originais (união = mesmo
-- acesso; nunca há janela sem policy).

-- ── 1. workouts (tabela mais quente) — own + silo → merged, por comando ─────
create policy workouts_delete__merged on public.workouts
  for delete to authenticated
  using (
    (user_id = ( select auth_uid() ))
    or (
      ( select is_admin() )
      or ((user_id = ( select auth.uid() )) and (created_by = ( select auth.uid() )))
      or (is_teacher_of(user_id) and (created_by = ( select auth.uid() )) and (is_template = true))
    )
  );
drop policy "workouts_delete_own" on public.workouts;
drop policy "workouts_delete_silo" on public.workouts;

create policy workouts_insert__merged on public.workouts
  for insert to authenticated
  with check (
    (user_id = ( select auth_uid() ))
    or (
      ( select is_admin() )
      or ((user_id = ( select auth.uid() )) and (created_by = ( select auth.uid() )))
      or (is_teacher_of(user_id) and (created_by = ( select auth.uid() )) and (is_template = true))
    )
  );
drop policy "workouts_insert_own" on public.workouts;
drop policy "workouts_insert_silo" on public.workouts;

create policy workouts_update__merged on public.workouts
  for update to authenticated
  using (
    (user_id = ( select auth_uid() ))
    or (
      ( select is_admin() )
      or ((user_id = ( select auth.uid() )) and (created_by = ( select auth.uid() )))
      or (is_teacher_of(user_id) and (created_by = ( select auth.uid() )) and (is_template = true))
    )
  )
  with check (
    (user_id = ( select auth_uid() ))
    or (
      ( select is_admin() )
      or ((user_id = ( select auth.uid() )) and (created_by = ( select auth.uid() )))
      or (is_teacher_of(user_id) and (created_by = ( select auth.uid() )) and (is_template = true))
    )
  );
drop policy "workouts_update_own" on public.workouts;
drop policy "workouts_update_silo" on public.workouts;

-- ── 2. assessments — 3 policies ALL → 1 (a SELECT de aluno fica intacta) ────
-- WITH CHECK de "Users manage own assessments" era NULL → cai no USING; por
-- isso o qual dela entra também no with_check da mesclada.
create policy assessments_all__merged on public.assessments
  for all to authenticated
  using (
    ((trainer_id = ( select auth.uid() )) and (exists ( select 1 from students s
      where s.user_id = assessments.user_id and s.teacher_id = ( select auth.uid() ))))
    or (( select auth.uid() ) = user_id)
    or (user_id = ( select auth_uid() ))
  )
  with check (
    ((trainer_id = ( select auth.uid() )) and (exists ( select 1 from students s
      where s.user_id = assessments.user_id and s.teacher_id = ( select auth.uid() ))))
    or (( select auth.uid() ) = user_id)
    or (user_id = ( select auth_uid() ))
  );
drop policy "Trainers manage student assessments" on public.assessments;
drop policy "Users manage own assessments" on public.assessments;
drop policy "assessments_own" on public.assessments;

-- ── 3. body_photo_assessments — owner + trainer → 1 ────────────────────────
create policy body_photo_assessments__merged on public.body_photo_assessments
  for all to authenticated
  using (
    (( select auth.uid() ) = user_id)
    or ((( select auth.uid() ) = trainer_id) and (exists ( select 1 from students s
      where s.user_id = body_photo_assessments.user_id and s.teacher_id = ( select auth.uid() ))))
  )
  with check (
    (( select auth.uid() ) = user_id)
    or ((( select auth.uid() ) = trainer_id) and (exists ( select 1 from students s
      where s.user_id = body_photo_assessments.user_id and s.teacher_id = ( select auth.uid() ))))
  );
drop policy "body_photo_assessments_owner" on public.body_photo_assessments;
drop policy "body_photo_assessments_trainer" on public.body_photo_assessments;

-- ── 4. body_photo_assessment_photos — owner + trainer → 1 ──────────────────
create policy body_photo_photos__merged on public.body_photo_assessment_photos
  for all to authenticated
  using (
    (( select auth.uid() ) = user_id)
    or (exists ( select 1 from body_photo_assessments a
      where a.id = body_photo_assessment_photos.assessment_id and a.trainer_id = ( select auth.uid() )))
  )
  with check (
    (( select auth.uid() ) = user_id)
    or (exists ( select 1 from body_photo_assessments a
      where a.id = body_photo_assessment_photos.assessment_id and a.trainer_id = ( select auth.uid() )))
  );
drop policy "body_photo_photos_owner" on public.body_photo_assessment_photos;
drop policy "body_photo_photos_trainer" on public.body_photo_assessment_photos;

-- ── 5. lab_exams — owner + trainer → 1 ─────────────────────────────────────
create policy lab_exams__merged on public.lab_exams
  for all to authenticated
  using (
    (( select auth.uid() ) = user_id)
    or ((( select auth.uid() ) = trainer_id) and (exists ( select 1 from students s
      where s.user_id = lab_exams.user_id and s.teacher_id = ( select auth.uid() ))))
  )
  with check (
    (( select auth.uid() ) = user_id)
    or ((( select auth.uid() ) = trainer_id) and (exists ( select 1 from students s
      where s.user_id = lab_exams.user_id and s.teacher_id = ( select auth.uid() ))))
  );
drop policy "lab_exams_owner" on public.lab_exams;
drop policy "lab_exams_trainer" on public.lab_exams;

-- ── 6. lab_exam_files — owner + trainer → 1 ────────────────────────────────
create policy lab_exam_files__merged on public.lab_exam_files
  for all to authenticated
  using (
    (exists ( select 1 from lab_exams e
      where e.id = lab_exam_files.exam_id and e.user_id = ( select auth.uid() )))
    or (exists ( select 1 from lab_exams e
      where e.id = lab_exam_files.exam_id and e.trainer_id = ( select auth.uid() )))
  )
  with check (
    (exists ( select 1 from lab_exams e
      where e.id = lab_exam_files.exam_id and e.user_id = ( select auth.uid() )))
    or (exists ( select 1 from lab_exams e
      where e.id = lab_exam_files.exam_id and e.trainer_id = ( select auth.uid() )))
  );
drop policy "lab_exam_files_owner" on public.lab_exam_files;
drop policy "lab_exam_files_trainer" on public.lab_exam_files;

-- ── 7. user_gyms — duas policies com predicado IDÊNTICO → fica uma ─────────
drop policy "Users can manage own gyms" on public.user_gyms;

-- ── 8. teacher_plan_subscriptions — auth_rls_initplan ──────────────────────
-- auth.uid() sem SELECT é reavaliado POR LINHA; com (select ...) vira initplan.
drop policy "teacher_plan_subscriptions_select_own" on public.teacher_plan_subscriptions;
create policy teacher_plan_subscriptions_select_own on public.teacher_plan_subscriptions
  for select to authenticated
  using (( select auth.uid() ) = user_id);

-- ── 9. FKs sem índice cobridor (advisor unindexed_foreign_keys) ────────────
-- exercise_aliases: a FK composta (canonical_id, user_id) só tinha índice na
-- ordem inversa (user_id, canonical_id) — não cobre a FK.
create index if not exists exercise_aliases_canonical_user_idx
  on public.exercise_aliases (canonical_id, user_id);
create index if not exists exercise_substitutions_to_id_idx
  on public.exercise_substitutions (to_id);
