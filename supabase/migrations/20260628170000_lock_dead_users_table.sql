-- 2ª auditoria de segurança (2026-06-28) — public.users (tabela morta, policies frouxas).
--
-- public.users (colunas id, email, name, avatar_url, created_at, updated_at) está VAZIA
-- (0 linhas) e NENHUM código do app a referencia (grep .from('users') = vazio). Mesmo
-- assim tinha policies permissivas: "Allow all access for authenticated users" (ALL),
-- "Enable insert for authenticated users only" (INSERT) e "Enable read access for all
-- users" (SELECT, USING true). Risco latente: se a tabela um dia for populada, qualquer
-- authenticated lê/escreve tudo (e ela tem coluna email/name = PII).
--
-- NÃO dropamos a tabela: `tracks` e `sessions` têm FK apontando pra public.users, então
-- um DROP exigiria CASCADE (invasivo/irreversível). A correção aqui é não-destrutiva e
-- reversível: remover as 3 policies permissivas. Com RLS habilitado e zero policies, a
-- tabela fica inerte para anon/authenticated — só service-role (bypass) acessa, e nada
-- no app a usa. FK não depende de RLS, então tracks/sessions não são afetados.
--
-- (Limpeza completa do cluster legado users+tracks+sessions fica como follow-up separado,
--  carece de confirmação explícita por ser destrutiva.)
--
-- Rollback: recriar as policies originais (não recomendado).

DROP POLICY IF EXISTS "Allow all access for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
