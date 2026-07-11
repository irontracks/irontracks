-- PERFORMANCE (auditoria UX/perf): índices em FKs sem índice (advisor unindexed_foreign_keys)
-- + drop de índices duplicados exatos (advisor duplicate_index). Aditivo/seguro: cada drop tem
-- um índice UNIQUE/idêntico que permanece cobrindo a coluna. NÃO dropa os 74 "unused" (risco).

create index if not exists idx_invites_from_uid on public.invites (from_uid);
create index if not exists idx_invites_to_uid on public.invites (to_uid);
create index if not exists idx_workout_set_logs_exercise_id on public.workout_set_logs (exercise_id);
create index if not exists idx_team_session_presence_user_id on public.team_session_presence (user_id);
create index if not exists idx_assessments_user_id on public.assessments (user_id);
create index if not exists idx_assessments_trainer_id on public.assessments (trainer_id);
create index if not exists idx_assessments_paired_assessment_id on public.assessments (paired_assessment_id);
create index if not exists idx_workout_sync_subscriptions_target_user_id on public.workout_sync_subscriptions (target_user_id);
create index if not exists idx_active_workout_sessions_controlled_by on public.active_workout_sessions (controlled_by);
create index if not exists idx_appointments_coach_id on public.appointments (coach_id);
create index if not exists idx_appointments_student_id on public.appointments (student_id);
create index if not exists idx_coach_inbox_states_student_user_id on public.coach_inbox_states (student_user_id);
create index if not exists idx_exercise_execution_submissions_reviewed_by on public.exercise_execution_submissions (reviewed_by);
create index if not exists idx_exercise_videos_created_by on public.exercise_videos (created_by);
create index if not exists idx_vip_periodization_exercise_state_user_id on public.vip_periodization_exercise_state (user_id);
create index if not exists idx_vip_periodization_workouts_workout_id on public.vip_periodization_workouts (workout_id);
create index if not exists idx_workout_session_logs_workout_id on public.workout_session_logs (workout_id);
create index if not exists idx_workout_checkins_active_session_user_id on public.workout_checkins (active_session_user_id);
create index if not exists idx_user_entitlements_plan_id on public.user_entitlements (plan_id);
create index if not exists idx_user_update_views_update_id on public.user_update_views (update_id);
create index if not exists idx_team_sessions_host_uid on public.team_sessions (host_uid);
create index if not exists idx_teachers_plan_tier_key on public.teachers (plan_tier_key);
create index if not exists idx_app_payments_plan_id on public.app_payments (plan_id);
create index if not exists idx_app_subscriptions_plan_id on public.app_subscriptions (plan_id);
create index if not exists idx_marketplace_payments_plan_id on public.marketplace_payments (plan_id);
create index if not exists idx_error_reports_resolved_by on public.error_reports (resolved_by);
create index if not exists idx_feature_flags_updated_by on public.feature_flags (updated_by);

drop index if exists public.idx_device_push_tokens_user;
drop index if exists public.idx_device_push_tokens_user_id;
drop index if exists public.idx_access_requests_email;
drop index if exists public.foods_off_cache_food_key_idx;
drop index if exists public.foods_taco_food_key_idx;
drop index if exists public.rest_day_intents_user_date_idx;
