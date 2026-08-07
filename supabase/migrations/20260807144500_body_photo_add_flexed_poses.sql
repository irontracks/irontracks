-- Avaliação por foto: três poses CONTRAÍDAS opcionais, além das relaxadas.
--
-- Relaxado, o desenvolvimento muscular por grupo é inferido por silhueta; sob
-- tensão aparecem separação de feixes, densidade e a assimetria L/R real. As
-- contraídas NÃO entram na estimativa de gordura (contração aumenta a definição
-- aparente e puxaria a faixa para baixo) — essa regra vive no prompt do laudo.
--
-- Aditivo: o UNIQUE (assessment_id, pose) continua valendo e segue permitindo
-- uma foto por pose. Avaliações antigas (só as 3 relaxadas) não mudam.
alter table public.body_photo_assessment_photos
  drop constraint if exists body_photo_assessment_photos_pose_check;

alter table public.body_photo_assessment_photos
  add constraint body_photo_assessment_photos_pose_check
  check (pose = any (array[
    'front'::text, 'side'::text, 'back'::text,
    'front_flex'::text, 'side_flex'::text, 'back_flex'::text
  ]));
