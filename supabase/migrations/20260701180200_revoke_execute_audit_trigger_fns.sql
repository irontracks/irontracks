-- Least-privilege: funções de trigger não devem ser chamáveis como RPC. O Supabase
-- concede EXECUTE a anon/authenticated por default (REVOKE FROM PUBLIC não cobre esses
-- grants explícitos). Revoga explicitamente. Triggers seguem disparando normalmente
-- (execução de trigger não checa EXECUTE na função). Fecha os 2 advisors WARN
-- (anon/authenticated_security_definer_function_executable) de audit_sets_change.
REVOKE EXECUTE ON FUNCTION public.audit_sets_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
