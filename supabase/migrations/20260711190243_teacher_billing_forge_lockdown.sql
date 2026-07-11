-- Auditoria da área do professor (2026-07-11).
--
-- ALTA — forja de cobrança de aluno. A policy "Teacher sees own student charges" /
-- "Teacher sees own students subscriptions" (cmd ALL, role authenticated) só validava
-- teacher_user_id = auth.uid() no with_check — SEM role gate e SEM verificar o vínculo
-- professor↔aluno. Com o GRANT de INSERT/UPDATE/DELETE de authenticated, qualquer usuário
-- logado inseria (via supabase-js direto) uma linha com teacher_user_id = self e
-- student_user_id = <vítima qualquer>, com pix_qr_code/pix_payload/invoice_url/amount
-- controlados por ele. A vítima LÊ essa cobrança pela policy "Student sees own charges" e
-- o app renderiza "você deve R$X, pague este PIX" → phishing/fraude financeira no produto.
--
-- TODAS as escritas LEGÍTIMAS nessas tabelas são service-role (verificado:
-- /api/student/charge, /api/teacher/billing-subscriptions, webhooks mercadopago — todos
-- via createAdminClient, que ignora RLS e não depende de GRANT). Logo revogar a escrita
-- de authenticated/anon fecha a forja sem quebrar o fluxo legítimo. A leitura (SELECT)
-- continua: professor pela policy ALL (qual teacher_user_id=auth.uid), aluno pela policy
-- "Student sees own".
revoke insert, update, delete on public.student_charges from authenticated, anon;
revoke insert, update, delete on public.student_subscriptions from authenticated, anon;

-- Hardening (defesa em profundidade). A tabela `teachers` já NÃO tem policy permissiva de
-- escrita para authenticated (só "Service role manages teachers"), então a auto-inserção
-- na whitelist de professores já era negada pela RLS. Mas o GRANT de tabela amplo
-- (INSERT/UPDATE/DELETE/TRUNCATE) permanecia — remove a superfície, casando com o padrão
-- de lockdown do VIP (lock_down_vip_self_grant_and_usage). Escrita segue via service-role.
revoke insert, update, delete, truncate on public.teachers from authenticated, anon;
