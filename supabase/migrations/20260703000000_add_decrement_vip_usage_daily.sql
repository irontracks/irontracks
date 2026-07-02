-- Reembolso atômico de cota de IA.
--
-- Usado quando a cota foi consumida no gate (checkVipFeatureAccess com meter:true) mas a
-- resposta NÃO foi entregue (falha do modelo, config ausente, ou request bloqueado por
-- limite). Decrementa o contador do dia com piso em 0 — o usuário só é cobrado por
-- mensagens que realmente recebeu, sem reabrir a janela TOCTOU (o gate segue atômico e
-- bloqueia quem passa do limite ANTES de chamar o modelo).
--
-- Espelha increment_vip_usage_daily: SECURITY DEFINER + checagem de auth (só o próprio
-- usuário autenticado ou o service_role). NÃO bumpa last_used_at (não estende a janela
-- semanal de um lançamento reembolsado). Auditoria 2026-07-02 (PA3).
CREATE OR REPLACE FUNCTION public.decrement_vip_usage_daily(p_user_id uuid, p_feature_key text, p_day date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.vip_usage_daily
     SET usage_count = GREATEST(0, usage_count - 1),
         updated_at = now()
   WHERE user_id = p_user_id AND feature_key = p_feature_key AND day = p_day
  RETURNING usage_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.decrement_vip_usage_daily(uuid, text, date) FROM PUBLIC;
-- O default-privilege do Supabase concede EXECUTE a anon; revogamos (least-privilege,
-- igual a increment_vip_usage_daily). A checagem interna já bloquearia anon de qualquer
-- forma (auth.uid() NULL → forbidden).
REVOKE EXECUTE ON FUNCTION public.decrement_vip_usage_daily(uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.decrement_vip_usage_daily(uuid, text, date) TO authenticated, service_role;
