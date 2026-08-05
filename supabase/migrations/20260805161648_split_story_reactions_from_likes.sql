-- Separa REAÇÃO (emoji) de CURTIDA (coração) nos stories.
--
-- Até aqui as duas moravam na MESMA linha de `social_story_likes` (a coluna
-- `emoji` era opcional). Efeitos que o usuário sentia:
--   1. reagir com 🔥 acendia o coração e somava +1 no contador, sem ele ter
--      curtido — `list` conta QUALQUER linha da tabela como curtida;
--   2. descurtir fazia DELETE da linha inteira e apagava a reação junto;
--   3. `social_story_likes` não tem policy de UPDATE, e o `react` usa upsert
--      (INSERT ... ON CONFLICT DO UPDATE). Então TROCAR de emoji — ou reagir
--      depois de já ter curtido — era barrado pela RLS com 403. O cliente não
--      checava a resposta e exibia "Reação enviada!" mesmo assim.
--
-- A tabela nova nasce com a policy de UPDATE que faltava.

create table if not exists public.social_story_reactions (
  story_id   uuid        not null references public.social_stories(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)            on delete cascade,
  emoji      text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

comment on table public.social_story_reactions is
  'Reação em emoji a um story. Independente de social_story_likes (curtida): reagir não curte, descurtir não apaga a reação. Uma reação por (story, usuário) — trocar de emoji faz UPDATE.';

-- A listagem agrega por story; sem isto seria seq scan a cada abertura da barra.
create index if not exists social_story_reactions_story_idx
  on public.social_story_reactions (story_id);

alter table public.social_story_reactions enable row level security;

-- Policies espelhando `social_story_likes`, MAIS o UPDATE que lá não existe.
-- SELECT restrito ao próprio usuário: a contagem pública é agregada no servidor
-- pelo admin client, como já acontece com as curtidas.
drop policy if exists social_story_reactions_select on public.social_story_reactions;
create policy social_story_reactions_select on public.social_story_reactions
  for select using ((user_id = (select auth.uid())) or (select is_admin()));

drop policy if exists social_story_reactions_insert on public.social_story_reactions;
create policy social_story_reactions_insert on public.social_story_reactions
  for insert with check (
    (user_id = (select auth.uid()))
    and (
      (select is_admin())
      or exists (
        select 1 from public.social_stories s
        where s.id = social_story_reactions.story_id
          and not s.is_deleted
          and s.expires_at > now()
          and can_view_story((select auth.uid()), s.author_id)
      )
    )
  );

-- O que faltava em `social_story_likes` e quebrava a troca de emoji.
drop policy if exists social_story_reactions_update on public.social_story_reactions;
create policy social_story_reactions_update on public.social_story_reactions
  for update
  using ((user_id = (select auth.uid())) or (select is_admin()))
  with check (user_id = (select auth.uid()));

drop policy if exists social_story_reactions_delete on public.social_story_reactions;
create policy social_story_reactions_delete on public.social_story_reactions
  for delete using ((user_id = (select auth.uid())) or (select is_admin()));

-- Backfill NÃO destrutivo: copia as reações existentes. As linhas de
-- `social_story_likes` ficam como estão — quem reagiu no modelo antigo aparecia
-- como tendo curtido, e remover isso agora tiraria curtidas que já estão na tela.
-- A coluna `emoji` de likes permanece por segurança de rollback; o código para de
-- lê-la e de escrevê-la nesta mesma mudança.
insert into public.social_story_reactions (story_id, user_id, emoji, created_at)
select story_id, user_id, emoji, created_at
from public.social_story_likes
where emoji is not null
on conflict (story_id, user_id) do nothing;
