-- Biblioteca de alimentos COMPARTILHADA entre contas (casal/parceiros de dieta).
--
-- Pedido do dono em 07/09/2026: ele e a Fran moram juntos, treinam juntos e a
-- dieta é a mesma, então tudo que um cadastra — foto de tabela nutricional,
-- código de barras — vale para os dois. Antes disso o único caminho era clonar
-- a biblioteca de uma conta para a outra, e o clone diverge no dia seguinte:
-- em 31/08/2026 foram 23 itens copiados, e uma semana depois 19 eram duplicata
-- exata e 4 já tinham nomes diferentes nos dois lados.
--
-- O modelo é UMA linha por alimento, não cópia por pessoa: quem edita corrige
-- para os dois, e não existe "a minha versão" para sair do lugar.
create table if not exists public.nutrition_library_partners (
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint nutrition_library_partners_sem_auto_vinculo check (user_id <> partner_id)
);

-- O EXISTS das policies de alimentos filtra por partner_id; sem índice ele
-- varre a tabela a cada linha de alimento lida.
create index if not exists idx_nutrition_library_partners_partner
  on public.nutrition_library_partners (partner_id);

alter table public.nutrition_library_partners enable row level security;

-- Os DOIS lados enxergam o vínculo. O lado `partner_id` precisa enxergar:
-- é ele que roda o EXISTS na policy de alimentos, e uma policy que só mostrasse
-- `user_id = auth.uid()` faria a subconsulta voltar vazia — o compartilhamento
-- não funcionaria e ninguém saberia por quê.
create policy nutrition_library_partners_select on public.nutrition_library_partners
  for select using (
    user_id = (select auth.uid()) or partner_id = (select auth.uid())
  );

-- ⚠️ Só se dá acesso à PRÓPRIA biblioteca. Sem este `with check`, qualquer um
-- inseriria (user_id = vítima, partner_id = eu) e passaria a ler a biblioteca
-- alheia — o mesmo self-grant que a auditoria de 2026-07-11 fechou no VIP
-- (migration lock_down_vip_self_grant_and_usage). O vínculo mútuo existe como
-- DUAS linhas, cada uma criada pelo dono da biblioteca que ela abre.
create policy nutrition_library_partners_insert on public.nutrition_library_partners
  for insert with check (user_id = (select auth.uid()));

create policy nutrition_library_partners_delete on public.nutrition_library_partners
  for delete using (user_id = (select auth.uid()));

-- ── Alimentos: minha biblioteca + a de quem me declarou parceiro ──────────────
-- A policy anterior (users_own_custom_foods) era FOR ALL com `auth.uid() = user_id`.
-- Ela é substituída por quatro, porque INSERT não pode seguir a mesma regra:
-- cadastrar sempre nasce na SUA conta, senão daria para criar linha em nome do
-- outro. Ler, editar e apagar valem para os dois — é o que "biblioteca única"
-- significa, inclusive na consequência: apagar apaga para ambos.
drop policy if exists users_own_custom_foods on public.nutrition_custom_foods;

create policy custom_foods_select on public.nutrition_custom_foods
  for select using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.nutrition_library_partners p
      where p.user_id = nutrition_custom_foods.user_id
        and p.partner_id = (select auth.uid())
    )
  );

create policy custom_foods_insert on public.nutrition_custom_foods
  for insert with check (user_id = (select auth.uid()));

create policy custom_foods_update on public.nutrition_custom_foods
  for update using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.nutrition_library_partners p
      where p.user_id = nutrition_custom_foods.user_id
        and p.partner_id = (select auth.uid())
    )
  ) with check (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.nutrition_library_partners p
      where p.user_id = nutrition_custom_foods.user_id
        and p.partner_id = (select auth.uid())
    )
  );

create policy custom_foods_delete on public.nutrition_custom_foods
  for delete using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.nutrition_library_partners p
      where p.user_id = nutrition_custom_foods.user_id
        and p.partner_id = (select auth.uid())
    )
  );
