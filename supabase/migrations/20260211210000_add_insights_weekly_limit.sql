-- Adicionar limite de insights_weekly aos planos
-- Usando operador || para merge/overwrite no jsonb, garantindo idempotência

-- VIP START: 3 insights/semana
UPDATE app_plans 
SET limits = limits || '{"insights_weekly": 3}'::jsonb 
WHERE id IN ('vip_start', 'vip_start_annual');

-- VIP PRO: 7 insights/semana
UPDATE app_plans 
SET limits = limits || '{"insights_weekly": 7}'::jsonb 
WHERE id IN ('vip_pro', 'vip_pro_annual');

-- VIP ELITE: Ilimitado (9999)
UPDATE app_plans 
SET limits = limits || '{"insights_weekly": 9999}'::jsonb 
WHERE id IN ('vip_elite', 'vip_elite_annual');
