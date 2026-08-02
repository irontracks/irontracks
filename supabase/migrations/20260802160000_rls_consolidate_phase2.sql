-- Consolidação RLS — FASE 2 (perf, ago/2026). Zera os 62 warns restantes de
-- multiple_permissive_policies (fase 1 = 20260802140000, 208 → 62).
--
-- As MESMAS regras de equivalência mecânica da fase 1:
-- • permissivas do mesmo comando combinam com OR → merge por OR LITERAL;
-- • policy cujo predicado é IDÊNTICO/subsumido por outra do mesmo comando é
--   redundante → drop (prova: auth_uid() é literalmente `SELECT auth.uid()`,
--   SECURITY DEFINER STABLE — verificado no pg_proc antes desta migration);
-- • policy que só passa para service_role (`auth.role() = 'service_role'`)
--   é retargetada TO service_role — efeito idêntico, advisor para de contar;
-- • ALL que sobrepõe policies por-comando vira per-comando (OR literal),
--   ficando 1 policy por ação;
-- • create antes de drop — nunca há janela sem policy.

-- ── notifications: SELECT e UPDATE têm o MESMO predicado da ALL → redundantes
drop policy "User read own notifications" on public.notifications;
drop policy "Users can update their own notifications" on public.notifications;

-- ── daily_nutrition_logs: 4 per-cmd públicos idênticos à ALL own → redundantes
drop policy "Daily nutrition logs delete" on public.daily_nutrition_logs;
drop policy "Daily nutrition logs insert" on public.daily_nutrition_logs;
drop policy "Daily nutrition logs select" on public.daily_nutrition_logs;
drop policy "Daily nutrition logs update" on public.daily_nutrition_logs;

-- ── nutrition_goals: idem
drop policy "Nutrition goals delete" on public.nutrition_goals;
drop policy "Nutrition goals insert" on public.nutrition_goals;
drop policy "Nutrition goals select" on public.nutrition_goals;
drop policy "Nutrition goals update" on public.nutrition_goals;

-- ── device_push_tokens: 4 per-cmd idênticos à ALL → drop; ALL vira
-- TO authenticated (anon nunca satisfazia) pra não sobrepor o SELECT de
-- service_role que continua existindo.
create policy device_push_tokens_all__own on public.device_push_tokens
  for all to authenticated
  using (( select auth.uid() ) = user_id)
  with check (( select auth.uid() ) = user_id);
drop policy "users_own_tokens" on public.device_push_tokens;
drop policy "device_push_tokens_delete_own" on public.device_push_tokens;
drop policy "device_push_tokens_insert_own" on public.device_push_tokens;
drop policy "device_push_tokens_select_own" on public.device_push_tokens;
drop policy "device_push_tokens_update_own" on public.device_push_tokens;

-- ── active_workout_sessions: ALL own é subsumida em TODOS os comandos
-- (D/I/U: own OR is_admin ⊇ own; SELECT merged: teacher OR own OR is_admin)
drop policy "active_sessions_all_own" on public.active_workout_sessions;

-- ── teacher_plans: ALL own subsumida (per-cmd = is_admin OR own [+status])
drop policy "teacher_plans_own" on public.teacher_plans;

-- ── student_diet_plans: ALL admin + SELECT own → per-comando, 1 por ação
create policy student_diet_plans_select__merged on public.student_diet_plans
  for select to authenticated
  using (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy student_diet_plans_insert_admin on public.student_diet_plans
  for insert to authenticated
  with check (( select is_admin() ));
create policy student_diet_plans_update_admin on public.student_diet_plans
  for update to authenticated
  using (( select is_admin() )) with check (( select is_admin() ));
create policy student_diet_plans_delete_admin on public.student_diet_plans
  for delete to authenticated
  using (( select is_admin() ));
drop policy "student_diet_plans_admin_all" on public.student_diet_plans;
drop policy "student_diet_plans_select_own" on public.student_diet_plans;

-- ── workout_sync_subscriptions: ALL de service_role → TO service_role;
-- os 2 SELECTs viram 1 (OR literal)
create policy workout_sync_subscriptions_service on public.workout_sync_subscriptions
  for all to service_role
  using (( select auth.role() ) = 'service_role'::text)
  with check (( select auth.role() ) = 'service_role'::text);
create policy workout_sync_subscriptions_select__merged on public.workout_sync_subscriptions
  for select to authenticated
  using (
    ((teacher_id = ( select auth.uid() )) or (student_id = ( select auth.uid() )))
    or ((( select auth.uid() ) = source_user_id) or (( select auth.uid() ) = target_user_id))
  );
drop policy "workout_sync_subscriptions_service_role_all" on public.workout_sync_subscriptions;
drop policy "workout_sync_subscriptions_actor_select" on public.workout_sync_subscriptions;
drop policy "workout_sync_subscriptions_select" on public.workout_sync_subscriptions;

-- ── workout_sync_mappings: ALL de service_role → TO service_role
create policy workout_sync_mappings_service on public.workout_sync_mappings
  for all to service_role
  using (( select auth.role() ) = 'service_role'::text)
  with check (( select auth.role() ) = 'service_role'::text);
drop policy "workout_sync_mappings_service_role_all" on public.workout_sync_mappings;

-- ── profiles: admin ALL vira per-comando mesclado com as policies own.
-- O SELECT merged já contém current_user_is_admin() — nada a acrescentar lá.
create policy profiles_insert__merged on public.profiles
  for insert to authenticated
  with check (
    ( select current_user_is_admin() )
    or (id = ( select auth_uid() ))
  );
create policy profiles_update__merged on public.profiles
  for update to authenticated
  using (
    ( select current_user_is_admin() )
    or (id = ( select auth_uid() ))
  )
  with check (
    ( select current_user_is_admin() )
    or (id = ( select auth_uid() ))
  );
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (( select current_user_is_admin() ));
drop policy "profiles_admin_all" on public.profiles;
drop policy "profiles_insert_own" on public.profiles;
drop policy "profiles_update_own" on public.profiles;

-- ── vip_periodization_* (3 tabelas): admin ALL → per-comando mesclado
create policy vip_periodization_programs_select__merged on public.vip_periodization_programs
  for select to authenticated
  using (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy vip_periodization_programs_insert__merged on public.vip_periodization_programs
  for insert to authenticated
  with check (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy vip_periodization_programs_update_admin on public.vip_periodization_programs
  for update to authenticated
  using (( select is_admin() )) with check (( select is_admin() ));
create policy vip_periodization_programs_delete_admin on public.vip_periodization_programs
  for delete to authenticated
  using (( select is_admin() ));
drop policy "vip_periodization_programs_admin_all" on public.vip_periodization_programs;
drop policy "vip_periodization_programs_write_own" on public.vip_periodization_programs;
drop policy "vip_periodization_programs_select_own" on public.vip_periodization_programs;

create policy vip_periodization_workouts_select__merged on public.vip_periodization_workouts
  for select to authenticated
  using (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy vip_periodization_workouts_insert__merged on public.vip_periodization_workouts
  for insert to authenticated
  with check (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy vip_periodization_workouts_update_admin on public.vip_periodization_workouts
  for update to authenticated
  using (( select is_admin() )) with check (( select is_admin() ));
create policy vip_periodization_workouts_delete_admin on public.vip_periodization_workouts
  for delete to authenticated
  using (( select is_admin() ));
drop policy "vip_periodization_workouts_admin_all" on public.vip_periodization_workouts;
drop policy "vip_periodization_workouts_write_own" on public.vip_periodization_workouts;
drop policy "vip_periodization_workouts_select_own" on public.vip_periodization_workouts;

create policy vip_periodization_exercise_state_select__merged on public.vip_periodization_exercise_state
  for select to authenticated
  using (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy vip_periodization_exercise_state_insert__merged on public.vip_periodization_exercise_state
  for insert to authenticated
  with check (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy vip_periodization_exercise_state_update_admin on public.vip_periodization_exercise_state
  for update to authenticated
  using (( select is_admin() )) with check (( select is_admin() ));
create policy vip_periodization_exercise_state_delete_admin on public.vip_periodization_exercise_state
  for delete to authenticated
  using (( select is_admin() ));
drop policy "vip_periodization_exercise_state_admin_all" on public.vip_periodization_exercise_state;
drop policy "vip_periodization_exercise_state_write_own" on public.vip_periodization_exercise_state;
drop policy "vip_periodization_exercise_state_select_own" on public.vip_periodization_exercise_state;

-- ── app_plans: admin ALL sobrepõe o SELECT ativo (authenticated) → per-cmd
create policy app_plans_select__merged on public.app_plans
  for select to authenticated
  using (( select is_admin() ) or (status = 'active'::text));
create policy app_plans_select_active_anon on public.app_plans
  for select to anon
  using (status = 'active'::text);
create policy app_plans_insert_admin on public.app_plans
  for insert to authenticated
  with check (( select is_admin() ));
create policy app_plans_update_admin on public.app_plans
  for update to authenticated
  using (( select is_admin() )) with check (( select is_admin() ));
create policy app_plans_delete_admin on public.app_plans
  for delete to authenticated
  using (( select is_admin() ));
drop policy "app_plans_write_admin" on public.app_plans;
drop policy "app_plans_select_active" on public.app_plans;

-- ── appointments: coach ALL (public) + select own → per-comando
create policy appointments_select__merged on public.appointments
  for select to authenticated
  using (
    (( select auth.uid() ) = coach_id)
    or ((student_id = ( select auth_uid() )) or (coach_id = ( select auth_uid() )))
  );
create policy appointments_insert_coach on public.appointments
  for insert to authenticated
  with check (( select auth.uid() ) = coach_id);
create policy appointments_update_coach on public.appointments
  for update to authenticated
  using (( select auth.uid() ) = coach_id)
  with check (( select auth.uid() ) = coach_id);
create policy appointments_delete_coach on public.appointments
  for delete to authenticated
  using (( select auth.uid() ) = coach_id);
drop policy "coaches_manage_own_appointments" on public.appointments;
drop policy "appointments_select_own" on public.appointments;

-- ── assessments: sobrou ALL merged × SELECT do aluno → per-comando
create policy assessments_select__merged on public.assessments
  for select to authenticated
  using (
    ((trainer_id = ( select auth.uid() )) and (exists ( select 1 from students s
      where s.user_id = assessments.user_id and s.teacher_id = ( select auth.uid() ))))
    or (( select auth.uid() ) = user_id)
    or (user_id = ( select auth_uid() ))
    or (( select auth.uid() ) = student_id)
  );
create policy assessments_insert__merged on public.assessments
  for insert to authenticated
  with check (
    ((trainer_id = ( select auth.uid() )) and (exists ( select 1 from students s
      where s.user_id = assessments.user_id and s.teacher_id = ( select auth.uid() ))))
    or (( select auth.uid() ) = user_id)
    or (user_id = ( select auth_uid() ))
  );
create policy assessments_update__merged on public.assessments
  for update to authenticated
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
create policy assessments_delete__merged on public.assessments
  for delete to authenticated
  using (
    ((trainer_id = ( select auth.uid() )) and (exists ( select 1 from students s
      where s.user_id = assessments.user_id and s.teacher_id = ( select auth.uid() ))))
    or (( select auth.uid() ) = user_id)
    or (user_id = ( select auth_uid() ))
  );
drop policy "assessments_all__merged" on public.assessments;
drop policy "Students view own assessments" on public.assessments;

-- ── student_charges: teacher ALL + student SELECT → per-comando
create policy student_charges_select__merged on public.student_charges
  for select to authenticated
  using (
    (teacher_user_id = ( select auth.uid() ))
    or (student_user_id = ( select auth.uid() ))
  );
create policy student_charges_insert_teacher on public.student_charges
  for insert to authenticated
  with check (teacher_user_id = ( select auth.uid() ));
create policy student_charges_update_teacher on public.student_charges
  for update to authenticated
  using (teacher_user_id = ( select auth.uid() ))
  with check (teacher_user_id = ( select auth.uid() ));
create policy student_charges_delete_teacher on public.student_charges
  for delete to authenticated
  using (teacher_user_id = ( select auth.uid() ));
drop policy "Teacher sees own student charges" on public.student_charges;
drop policy "Student sees own charges" on public.student_charges;

-- ── student_service_plans: idem
create policy student_service_plans_select__merged on public.student_service_plans
  for select to authenticated
  using (
    (teacher_user_id = ( select auth.uid() ))
    or ((is_active = true) and (exists ( select 1 from students s
      where s.user_id = ( select auth.uid() ) and s.teacher_id = student_service_plans.teacher_user_id)))
  );
create policy student_service_plans_insert_teacher on public.student_service_plans
  for insert to authenticated
  with check (teacher_user_id = ( select auth.uid() ));
create policy student_service_plans_update_teacher on public.student_service_plans
  for update to authenticated
  using (teacher_user_id = ( select auth.uid() ))
  with check (teacher_user_id = ( select auth.uid() ));
create policy student_service_plans_delete_teacher on public.student_service_plans
  for delete to authenticated
  using (teacher_user_id = ( select auth.uid() ));
drop policy "Teacher manages own service plans" on public.student_service_plans;
drop policy "Student reads active plans from own teacher" on public.student_service_plans;

-- ── student_subscriptions: idem
create policy student_subscriptions_select__merged on public.student_subscriptions
  for select to authenticated
  using (
    (teacher_user_id = ( select auth.uid() ))
    or (student_user_id = ( select auth.uid() ))
  );
create policy student_subscriptions_insert_teacher on public.student_subscriptions
  for insert to authenticated
  with check (teacher_user_id = ( select auth.uid() ));
create policy student_subscriptions_update_teacher on public.student_subscriptions
  for update to authenticated
  using (teacher_user_id = ( select auth.uid() ))
  with check (teacher_user_id = ( select auth.uid() ));
create policy student_subscriptions_delete_teacher on public.student_subscriptions
  for delete to authenticated
  using (teacher_user_id = ( select auth.uid() ));
drop policy "Teacher sees own students subscriptions" on public.student_subscriptions;
drop policy "Student sees own subscription" on public.student_subscriptions;

-- ── user_entitlements (ZONA VIP — leitura continua a única via do client
-- comum; a escrita admin já existia e é preservada LITERALMENTE)
create policy user_entitlements_select__merged on public.user_entitlements
  for select to authenticated
  using (( select is_admin() ) or (user_id = ( select auth.uid() )));
create policy user_entitlements_insert_admin on public.user_entitlements
  for insert to authenticated
  with check (( select is_admin() ));
create policy user_entitlements_update_admin on public.user_entitlements
  for update to authenticated
  using (( select is_admin() )) with check (( select is_admin() ));
create policy user_entitlements_delete_admin on public.user_entitlements
  for delete to authenticated
  using (( select is_admin() ));
drop policy "user_entitlements_admin_all" on public.user_entitlements;
drop policy "user_entitlements_select_own" on public.user_entitlements;

-- ── vip_usage_daily: dois SELECTs com predicado IDÊNTICO → fica um
drop policy "Users can view own usage" on public.vip_usage_daily;
