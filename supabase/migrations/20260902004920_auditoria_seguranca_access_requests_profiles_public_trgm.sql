-- Auditoria de segurança de 01/09/2026 — três correções de banco.
--
-- 1) access_requests: a policy "Allow public insert" deixava QUALQUER portador da
--    anon key (que é pública por natureza) inserir pedidos direto pelo PostgREST,
--    fora do rate limit de /api/access-request/create. O formulário público e o
--    fluxo da Apple gravam por service-role (createAdminClient), então a policy
--    não tinha leitor legítimo — só abria a fila de aprovação para spam.
drop policy if exists "Allow public insert to access_requests" on public.access_requests;

-- 2) profiles_public: a view fica em SECURITY DEFINER DE PROPÓSITO — a RLS de
--    profiles só deixa ler o próprio, o professor e o admin, e a lista da
--    comunidade precisa das 6 colunas públicas (id, display_name, handle,
--    photo_url, last_seen, role) de todo mundo. O que não tinha motivo eram os
--    grants de ESCRITA que o "GRANT ALL" deixou na view.
revoke insert, update, delete, truncate, references, trigger on public.profiles_public from anon, authenticated;
revoke all on public.profiles_public from anon;

-- 3) pg_trgm sai do schema public (advisor 0014). Seguro porque o search_path do
--    banco já inclui `extensions`, nenhuma função do app chama similarity()/
--    show_trgm() (só as da própria extensão), e o único uso é o índice GIN
--    idx_exercises_name_trgm, cujo opclass acompanha a extensão.
alter extension pg_trgm set schema extensions;
