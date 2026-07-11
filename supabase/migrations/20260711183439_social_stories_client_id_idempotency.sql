-- Story create não tinha chave idempotente (nutrition_meal_entries e workouts finish
-- têm). Um timeout de 30s no fetch de publicação APÓS o servidor commitar o INSERT +
-- re-tap manual do usuário gerava 2 stories idênticos no feed. Espelha o padrão da
-- nutrição: client_id + índice único parcial (author_id, client_id). A rota
-- /api/social/stories/create passa a tratar 23505 devolvendo a linha existente (sem
-- duplicar nem re-enfileirar o processamento/notificação); o compositor reusa o mesmo
-- clientId no retry manual da mesma publicação.
alter table public.social_stories add column if not exists client_id text;
create unique index if not exists social_stories_author_client_uniq
  on public.social_stories (author_id, client_id) where client_id is not null;
