-- C4 (auditoria de cobranças 2026-08-14): a consolidação de RLS de 02/08
-- (20260802160000_rls_consolidate_phase2.sql) recriou policies de escrita para
-- authenticated em student_charges/student_subscriptions — desfazendo metade do
-- lockdown de julho (20260711190243_teacher_billing_forge_lockdown.sql), que
-- existia porque qualquer autenticado conseguia forjar cobrança para outra
-- pessoa (phishing com PIX/valor/aluno controlados pelo atacante).
--
-- Estado medido em produção antes desta migration: os GRANTs de escrita seguem
-- revogados (has_table_privilege = false), então as policies estavam MORTAS —
-- nada explorável hoje. Mas são uma mina: um GRANT futuro qualquer reabriria a
-- forja na hora, e a policy só valida teacher_user_id = auth.uid(), sem role de
-- professor nem vínculo professor-aluno. Escrita financeira nestas tabelas é
-- exclusiva do service-role (rotas server); o client só lê (policies de SELECT
-- ficam intactas).
drop policy if exists student_charges_insert_teacher on public.student_charges;
drop policy if exists student_charges_update_teacher on public.student_charges;
drop policy if exists student_charges_delete_teacher on public.student_charges;
drop policy if exists student_subscriptions_insert_teacher on public.student_subscriptions;
drop policy if exists student_subscriptions_update_teacher on public.student_subscriptions;
drop policy if exists student_subscriptions_delete_teacher on public.student_subscriptions;

-- Reafirma o lockdown de julho (idempotente — já é o estado de produção).
revoke insert, update, delete on public.student_charges from authenticated, anon;
revoke insert, update, delete on public.student_subscriptions from authenticated, anon;
