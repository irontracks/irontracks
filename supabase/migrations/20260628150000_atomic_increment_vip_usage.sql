-- 2ª auditoria de segurança (2026-06-28), M-1 — race condition em incrementVipUsage.
--
-- O incrementVipUsage (src/utils/vip/limits.ts) fazia, no ramo de conflito, um
-- read-then-write: SELECT usage_count → calcula +1 → UPDATE ... WHERE usage_count = lido
-- (optimistic lock). Sob concorrência, o UPDATE casava 0 linhas e o PostgREST trata
-- 0-row update como sucesso (error null) → o increment era perdido SEM log nem retry.
-- O gate checkVipFeatureAccess lê esse mesmo usage_count pra decidir allowed = current < limit,
-- então a contagem subestimada mantinha o gate aberto ACIMA do limite contratado —
-- consumo de IA paga (Gemini) acima da cota, custo real, trivial de reproduzir (2 abas).
--
-- Correção: increment atômico no banco via INSERT ... ON CONFLICT DO UPDATE
-- SET usage_count = usage_count + 1. Fecha a janela TOCTOU definitivamente.
--
-- Guard interno (SECURITY DEFINER bypassa RLS): só o próprio usuário ou service_role
-- pode incrementar — impede um terceiro inflar a cota de outro (DoS de feature).
-- Validado em dry-run transacional: 3 chamadas sequenciais retornaram 1, 2, 3.
--
-- Rollback: DROP FUNCTION public.increment_vip_usage_daily(uuid, text, date);

CREATE OR REPLACE FUNCTION public.increment_vip_usage_daily(
  p_user_id uuid,
  p_feature_key text,
  p_day date
) RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Só o próprio usuário (sessão authenticated) ou o backend (service_role) incrementa.
  IF auth.uid() IS DISTINCT FROM p_user_id AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.vip_usage_daily (user_id, feature_key, day, usage_count, last_used_at, updated_at)
  VALUES (p_user_id, p_feature_key, p_day, 1, now(), now())
  ON CONFLICT (user_id, feature_key, day)
  DO UPDATE SET usage_count = public.vip_usage_daily.usage_count + 1,
                last_used_at = now(),
                updated_at = now()
  RETURNING usage_count INTO v_count;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_vip_usage_daily(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_vip_usage_daily(uuid, text, date) TO authenticated, service_role;
