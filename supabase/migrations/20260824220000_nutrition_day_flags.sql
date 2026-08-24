-- Dias de nutrição marcados pelo usuário como REGISTRO INCOMPLETO.
--
-- Por quê: a média do histórico divide pelos dias COM lançamento, o que já
-- evita o pior caso (dividir por 30 quem lançou 12). Mas um dia em que a
-- pessoa lançou só o café da manhã entra como se fosse um dia inteiro e puxa
-- a média para baixo. Medido na conta do dono em 24/08/2026, 68 dias
-- registrados: dias com 3+ refeições somam 2.544 kcal em média; os de 1
-- refeição, 970. A média exibida era 2.199 contra 2.544 dos dias bem
-- registrados — 345 kcal, ~14% de erro, num número que vai para o
-- nutricionista.
--
-- A marca é SEMPRE do usuário. O app pode SUGERIR (heurística sobre o padrão
-- da própria pessoa), mas nunca decide sozinho: em fase de CUT um dia de
-- 1.200 kcal pode ser o plano, e excluí-lo apagaria um dado verdadeiro.
create table if not exists public.nutrition_day_flags (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Mesmo `date` de `nutrition_meal_entries`: dia BRT gravado pelo app.
  date       date not null,
  -- Espaço para outros motivos no futuro sem nova migration (ex.: viagem).
  reason     text not null default 'incomplete',
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

comment on table public.nutrition_day_flags is
  'Dias que o usuário marcou para NÃO entrar nas médias de kcal/macros. A marca é sempre manual; o app apenas sugere candidatos.';

alter table public.nutrition_day_flags enable row level security;

-- A linha é do usuário e só dele. Sem policy de admin: não há tela
-- administrativa que precise ler isto, e o professor não decide o que conta
-- como registro completo do aluno.
create policy nutrition_day_flags_select on public.nutrition_day_flags
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy nutrition_day_flags_insert on public.nutrition_day_flags
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy nutrition_day_flags_delete on public.nutrition_day_flags
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Sem UPDATE de propósito: marcar e desmarcar são insert e delete. Um update
-- só faria sentido para trocar o `reason`, e aí é apagar e marcar de novo.

-- A consulta é sempre "as marcas deste usuário neste intervalo", e a PK
-- (user_id, date) já é exatamente esse índice. Nenhum índice extra.
