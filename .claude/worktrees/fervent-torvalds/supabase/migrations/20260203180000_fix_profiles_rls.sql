-- CORREÇÃO DE PERMISSÕES DA TABELA PROFILES
-- Motivo: Erro 42501 (Permission Denied) ao buscar perfis de alunos para avaliação e chat.

BEGIN;

-- 1. Garante que RLS está ativo
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas de SELECT restritivas anteriores para limpar o terreno
-- (Usamos DO block para evitar erro se não existirem)
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
    DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
EXCEPTION 
    WHEN OTHERS THEN NULL;
END $$;

-- 3. Cria política permissiva para SELECT (Leitura)
-- Todo usuário logado pode ler a tabela profiles.
-- Isso é fundamental para:
-- a) Professores encontrarem alunos pelo ID.
-- b) Chat funcionar (ver nome/foto do remetente).
-- c) Funcionalidades sociais (Feed, Comunidade).
CREATE POLICY "profiles_read_all_authenticated"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- 4. Garante permissões de nível de tabela (GRANT)
-- Restaura acesso caso tenha sido revogado anteriormente
GRANT SELECT ON public.profiles TO authenticated;

COMMIT;
