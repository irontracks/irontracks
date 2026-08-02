-- Auditoria da área de professor — hygiene/defense-in-depth (nada explorável hoje, mas
-- superfície desnecessária ou bug latente).

-- 1) TRUNCATE ignora RLS. authenticated/anon não têm por que truncar essas tabelas (o
--    hardening de 2026-07-11 revogou insert/update/delete mas esqueceu o truncate).
revoke truncate on public.coach_inbox_states from authenticated, anon;
revoke truncate on public.student_charges from authenticated, anon;
revoke truncate on public.student_subscriptions from authenticated, anon;

-- 2) anon (sem sessão) não deve ter grant de escrita em submissões de vídeo (a RLS já nega
--    por auth.uid() nulo, mas é superfície desnecessária — mesmo padrão das tabelas de saúde).
revoke insert, update, delete on public.exercise_execution_submissions from anon;

-- 3) BAIXA: a policy de SELECT de storage do professor referenciava storage.foldername(s.name)
--    (s.name = students.name, coluna errada) em vez do path do objeto -> quase nunca casava
--    (fail-closed: professor negado). Não é o caminho de enforcement (a rota media usa
--    service-role), mas corrige o bug latente. Muda SÓ s.name -> objects.name.
drop policy if exists execution_videos_select_own_teacher_admin on storage.objects;
create policy execution_videos_select_own_teacher_admin on storage.objects
  for select to authenticated
  using (
    (bucket_id = 'execution-videos'::text) AND (
      is_admin()
      OR (owner = auth.uid())
      OR (EXISTS (
        SELECT 1 FROM students s
        WHERE ((s.teacher_id = auth.uid()) AND ((s.user_id)::text = (storage.foldername(objects.name))[1]))
      ))
    )
  );
