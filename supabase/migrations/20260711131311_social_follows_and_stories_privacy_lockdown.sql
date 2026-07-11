-- Auditoria social/feed (2026-07-11) — 2 falhas CRÍTICAS de privacidade:
--
-- CRÍTICO #1 — social_follows self-accept. A policy de INSERT só validava follower_id
--   (with_check = follower_id = auth.uid()), sem checar o status. Como status é enum
--   {pending,accepted} default 'pending' SEM constraint/trigger forçando pending, um
--   usuário inseria direto status='accepted' e auto-aprovava follow em qualquer conta
--   privada — furando todo o modelo de aprovação (lia perfil/feed privados, entrava na
--   lista de seguidores aceitos, recebia os pushes sociais da vítima). Agora o INSERT
--   exige status='pending'; a promoção a 'accepted' já é exclusiva da policy UPDATE
--   (social_follows_update_following, lado following_id = quem legitimamente aprova).
--   Caminhos legítimos verificados: /api/social/follow insere 'pending'; o client só
--   faz SELECT/DELETE; nenhum fluxo insere 'accepted' direto.
drop policy if exists social_follows_insert_own on public.social_follows;
create policy social_follows_insert_own on public.social_follows
  for insert to authenticated
  with check (follower_id = (select auth.uid()) and status = 'pending');

-- Higiene: anon não precisa de escrita em social_follows (a RLS já bloqueia via
-- auth.uid() nulo; remove superfície e casa com o padrão de lockdown do repo).
revoke insert, update, delete, truncate, references, trigger on public.social_follows from anon;

-- CRÍTICO #2 — bucket social-stories sem amarra de dono/seguidor. As 3 policies
--   (Stories Select/Insert/Update) só checavam bucket_id='social-stories' para role
--   authenticated → qualquer usuário logado podia .list()/baixar a mídia de story de
--   conta privada (contornando can_view_story da tabela, que só protege a LINHA, não os
--   BYTES) e sobrescrever a mídia de terceiros. A visualização legítima é feita pela
--   rota /api/social/stories/media (service-role gera signed URL após checar
--   can_view_story/follow aceito), e nenhum código cliente lê a mídia direto — logo,
--   restringir estas policies ao DONO não quebra a visualização por seguidores.
--   Padrão idêntico ao bucket lab-exams já usado no projeto. Uploads (TUS com JWT no
--   próprio path {uid}/stories/... e uploadToSignedUrl via token) continuam funcionando.
drop policy if exists "Stories Select" on storage.objects;
drop policy if exists "Stories Insert" on storage.objects;
drop policy if exists "Stories Update" on storage.objects;

create policy "social_stories_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'social-stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "social_stories_owner_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'social-stories' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "social_stories_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'social-stories' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'social-stories' and (storage.foldername(name))[1] = (select auth.uid())::text);
