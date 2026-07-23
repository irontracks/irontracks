-- Tabela de substituição entre exercícios (pré-requisito #4b do motor de auto-regulação de carga).
--
-- Objetivo: dado um exercício que o usuário nunca fez (sem histórico de carga), o motor
-- precisa herdar um e1RM de um exercício SIMILAR que o usuário já treinou (cold-start).
-- O sistema canônico existente (exercise_canonical/aliases) só DEDUPLICA nomes iguais;
-- ele NÃO relaciona exercícios distintos porém equivalentes (supino reto ↔ inclinado).
-- Esta tabela preenche essa lacuna.
--
-- Semente determinística a partir de exercise_library (músculo + padrão de movimento),
-- em duas camadas: same-primary (auto) + adjacência muscular curada (curated).
-- Reexecutável: seed dentro de transação idempotente por PK (from_id,to_id).

create table if not exists public.exercise_substitutions (
  from_id    uuid not null references public.exercise_library(id) on delete cascade,
  to_id      uuid not null references public.exercise_library(id) on delete cascade,
  similarity numeric(4,3) not null check (similarity > 0 and similarity <= 1),
  relation   text not null default 'substitute' check (relation in ('substitute','variation','progression','regression')),
  source     text not null default 'auto' check (source in ('auto','curated','ai')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  constraint exercise_substitutions_no_self check (from_id <> to_id)
);

comment on table public.exercise_substitutions is
  'Grafo de substituição entre exercícios (similaridade 0-1). Alimenta o cold-start do motor de auto-carga. Somente leitura para clientes; escrita via service-role.';

-- Busca típica do motor: "dado X, ranqueie os substitutos por similaridade".
create index if not exists exercise_substitutions_from_sim_idx
  on public.exercise_substitutions (from_id, similarity desc);

-- RLS obrigatória. Referência de leitura para autenticados; escrita só via service-role
-- (bypassa RLS) — nenhuma policy de INSERT/UPDATE/DELETE é criada de propósito.
alter table public.exercise_substitutions enable row level security;

drop policy if exists "exercise_substitutions_read_authenticated" on public.exercise_substitutions;
create policy "exercise_substitutions_read_authenticated"
  on public.exercise_substitutions
  for select
  to authenticated
  using (true);

grant select on public.exercise_substitutions to authenticated;

-- ----------------------------------------------------------------------------
-- Semente camada 1: mesmo músculo primário (auto)
-- similarity = 0,50 base
--   + 0,20 se o padrão de movimento casa (composto↔composto | isolado↔isolado)
--   + 0,30 * Jaccard(secundários)
-- ----------------------------------------------------------------------------
insert into public.exercise_substitutions (from_id, to_id, similarity, relation, source)
select
  a.id, b.id,
  round((
    0.5
    + 0.2 * (case when a.is_compound is not distinct from b.is_compound then 1 else 0 end)
    + 0.3 * coalesce(
        cardinality(array(select unnest(a.secondary_muscles) intersect select unnest(b.secondary_muscles)))::numeric
        / nullif(cardinality(array(select unnest(a.secondary_muscles) union select unnest(b.secondary_muscles)))::numeric, 0),
        0)
  )::numeric, 3),
  'substitute', 'auto'
from public.exercise_library a
join public.exercise_library b
  on a.primary_muscle = b.primary_muscle
 and a.id <> b.id
where a.primary_muscle is not null
on conflict (from_id, to_id) do nothing;

-- ----------------------------------------------------------------------------
-- Semente camada 2: músculos adjacentes (curated) — substitutos plausíveis quando
-- o exato não existe (ex.: perna posterior ↔ glúteos). Score amortecido pelo fator.
-- ----------------------------------------------------------------------------
with adjacency(m1, m2, factor) as (
  values
    ('ombros', 'ombros_posteriores', 0.80),
    ('posterior_de_coxa', 'gluteos', 0.75),
    ('quadriceps', 'gluteos', 0.65),
    ('core', 'abdomen', 0.90),
    ('costas', 'trapezio', 0.70),
    ('biceps', 'antebraco', 0.60)
),
-- expande cada par nos dois sentidos
adj_both(m_from, m_to, factor) as (
  select m1, m2, factor from adjacency
  union all
  select m2, m1, factor from adjacency
)
insert into public.exercise_substitutions (from_id, to_id, similarity, relation, source)
select
  a.id, b.id,
  round((adj.factor * (
    0.5
    + 0.2 * (case when a.is_compound is not distinct from b.is_compound then 1 else 0 end)
    + 0.3 * coalesce(
        cardinality(array(select unnest(a.secondary_muscles) intersect select unnest(b.secondary_muscles)))::numeric
        / nullif(cardinality(array(select unnest(a.secondary_muscles) union select unnest(b.secondary_muscles)))::numeric, 0),
        0)
  ))::numeric, 3),
  'substitute', 'curated'
from adj_both adj
join public.exercise_library a on a.primary_muscle = adj.m_from
join public.exercise_library b on b.primary_muscle = adj.m_to
where a.id <> b.id
on conflict (from_id, to_id) do nothing;
