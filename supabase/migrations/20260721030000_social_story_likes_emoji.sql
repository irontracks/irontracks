-- Reação de story: o emoji escolhido não era persistido — social_story_likes só tinha
-- (story_id, user_id). Por isso a reação "não fixava" no viewer: nada pra salvar nem pra
-- recarregar. Coluna nullable e aditiva (zero perda de dado). Likes antigos ficam com emoji NULL.
ALTER TABLE public.social_story_likes
  ADD COLUMN IF NOT EXISTS emoji text;
