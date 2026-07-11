-- Auditoria de gamificação/integridade (2026-07-11).

-- 1) referrals: with_check só amarrava referred_id=auth.uid (não referrer_id), e authenticated
-- tinha INSERT → um usuário forjava indicação direto via supabase-js (auto-indicar ou creditar
-- a assinatura a um referrer arbitrário). A escrita LEGÍTIMA é service-role
-- (/api/referral/register: admin.insert, valida self-ref + código). Revoga a escrita direta.
revoke insert, update, delete on public.referrals from authenticated, anon;

-- 2) user_achievements: escrita só via service-role (workoutNotifications recomputa a
-- elegibilidade no servidor). RLS já negava (default-deny p/ escrita), mas o GRANT amplo
-- permanecia. Remove a superfície de self-grant de badge.
revoke insert, update, delete on public.user_achievements from authenticated, anon;

-- 3) workout_checkins: o with_check de INSERT/UPDATE tinha `w.user_id = w.user_id` (tautologia,
-- sempre true) no lugar de `w.user_id = auth.uid()` → o guard "só referencia o próprio workout"
-- virou no-op, deixando um checkin apontar para planned_workout_id/workout_id de OUTRO usuário.
-- ALTER só do with_check (preserva o resto das policies).
alter policy workout_checkins_insert on public.workout_checkins with check (
  is_admin() OR ((user_id = auth.uid())
    AND ((active_session_user_id IS NULL) OR (active_session_user_id = user_id))
    AND ((planned_workout_id IS NULL) OR EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_checkins.planned_workout_id AND w.user_id = auth.uid()))
    AND ((workout_id IS NULL) OR EXISTS (SELECT 1 FROM public.workouts w2 WHERE w2.id = workout_checkins.workout_id AND w2.user_id = auth.uid()))));
alter policy workout_checkins_update on public.workout_checkins with check (
  is_admin() OR ((user_id = auth.uid())
    AND ((active_session_user_id IS NULL) OR (active_session_user_id = user_id))
    AND ((planned_workout_id IS NULL) OR EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_checkins.planned_workout_id AND w.user_id = auth.uid()))
    AND ((workout_id IS NULL) OR EXISTS (SELECT 1 FROM public.workouts w2 WHERE w2.id = workout_checkins.workout_id AND w2.user_id = auth.uid()))));
