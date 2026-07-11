-- Auditoria de gamificação/execução (parte 2).

-- 1) iron_rank_leaderboard: (a) TETO por set (weight<=1000, reps<=100; log legado<=100000)
-- pra impedir liderar o ranking com um workout de weight/reps absurdos; (b) OPT-OUT real —
-- exclui quem desligou showIronRank (antes o setting só escondia o card, mas o usuário
-- continuava no ranking que os OUTROS viam). Reproduzida verbatim + os 3 pontos de mudança.
CREATE OR REPLACE FUNCTION public.iron_rank_leaderboard(limit_count integer)
 RETURNS TABLE(user_id uuid, display_name text, photo_url text, role text, total_volume_kg numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_role text := auth.role();
  effective_limit int := LEAST(GREATEST(COALESCE(limit_count, 50), 1), 200);
BEGIN
  IF caller IS NULL AND COALESCE(caller_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  WITH base_workouts AS (
    SELECT w.id, w.user_id, w.notes
    FROM public.workouts w
    WHERE w.is_template = false
  ),
  sets_by_workout AS (
    SELECT
      bw.id AS workout_id,
      bw.user_id AS uid,
      SUM(LEAST(COALESCE(s.weight, 0), 1000) * LEAST(COALESCE(public.try_parse_numeric(s.reps::text), 0), 100)) AS volume_kg
    FROM base_workouts bw
    JOIN public.exercises e ON e.workout_id = bw.id
    JOIN public.sets s ON s.exercise_id = e.id
    WHERE COALESCE(s.completed, true) = true
      AND COALESCE(s.weight, 0) > 0
      AND COALESCE(public.try_parse_numeric(s.reps::text), 0) > 0
    GROUP BY bw.id, bw.user_id
  ),
  legacy_by_workout AS (
    SELECT
      bw.id AS workout_id,
      bw.user_id AS uid,
      SUM(LEAST(public.set_volume_from_log(j.value), 100000)) AS volume_kg
    FROM base_workouts bw
    CROSS JOIN LATERAL jsonb_each(COALESCE((public.try_parse_jsonb(bw.notes)->'logs'), '{}'::jsonb)) AS j(key, value)
    WHERE NOT EXISTS (SELECT 1 FROM sets_by_workout sbw WHERE sbw.workout_id = bw.id)
      AND lower(coalesce(j.value->>'done', '')) IN ('true', 't', '1', 'yes', 'y')
      AND public.set_volume_from_log(j.value) > 0
    GROUP BY bw.id, bw.user_id
  ),
  lifted AS (
    SELECT
      x.uid,
      SUM(x.volume_kg) AS total_volume_kg
    FROM (
      SELECT sbw.uid, sbw.volume_kg FROM sets_by_workout sbw
      UNION ALL
      SELECT lbw.uid, lbw.volume_kg FROM legacy_by_workout lbw
    ) x
    GROUP BY x.uid
  )
  SELECT
    p.id AS user_id,
    p.display_name,
    p.photo_url,
    p.role,
    COALESCE(l.total_volume_kg, 0) AS total_volume_kg
  FROM lifted l
  JOIN public.profiles p ON p.id = l.uid
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE COALESCE(l.total_volume_kg, 0) > 0
    AND COALESCE((us.preferences->>'showIronRank')::boolean, true) = true
  ORDER BY l.total_volume_kg DESC
  LIMIT effective_limit;
END;
$function$;

-- 2) exercise_execution_submissions: o aluno podia auto-aprovar a própria submissão (RLS de
-- UPDATE permite o ramo student_user_id=auth.uid, e RLS não é coluna-nível). Trigger BEFORE
-- UPDATE preserva os campos de REVISÃO quando o autor NÃO é professor-do-aluno / admin /
-- service_role — deixa o aluno atualizar mídia/notes, mas não o veredito.
create or replace function public.ees_guard_review_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.is_admin() or exists (
    select 1 from public.students s where s.teacher_id = auth.uid() and s.user_id = new.student_user_id
  )) then
    new.status := old.status;
    new.teacher_feedback := old.teacher_feedback;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end $$;
drop trigger if exists ees_guard_review_fields on public.exercise_execution_submissions;
create trigger ees_guard_review_fields before update on public.exercise_execution_submissions
  for each row execute function public.ees_guard_review_fields();

-- 3) Higiene: revoga escrita de anon nas tabelas de dado de saúde (RLS já nega via auth.uid
-- nulo, mas remove a superfície). authenticated mantém (tem policy de dono/autoavaliação).
revoke insert, update, delete on public.assessments from anon;
revoke insert, update, delete on public.body_photo_assessments from anon;
revoke insert, update, delete on public.body_photo_assessment_photos from anon;
revoke insert, update, delete on public.lab_exams from anon;
revoke insert, update, delete on public.lab_exam_files from anon;
