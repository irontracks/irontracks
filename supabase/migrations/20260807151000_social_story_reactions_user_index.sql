-- FK sem índice de cobertura (advisor de performance, 07/08/2026).
-- A PK é (story_id, user_id); filtrar ou cascatear por user_id sozinho não
-- usa esse índice — apagar um usuário faria seq scan na tabela de reações.
create index if not exists social_story_reactions_user_idx
  on public.social_story_reactions (user_id);
