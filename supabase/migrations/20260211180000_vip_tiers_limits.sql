-- Adicionar coluna de limites aos planos
ALTER TABLE app_plans ADD COLUMN IF NOT EXISTS limits JSONB DEFAULT '{}'::jsonb;

-- Atualizar/Inserir planos com os novos limites
-- VIP Start
INSERT INTO app_plans (id, name, price_cents, interval, description, features, limits, created_at)
VALUES (
  'vip_start', 
  'VIP Start', 
  2990, 
  'month', 
  'Coach IA essencial para treinos e ajustes.',
  '["Coach IA (10 msg/dia)", "Workout Wizard (1/semana)", "Histórico 60 dias"]'::jsonb,
  '{"chat_daily": 10, "wizard_weekly": 1, "history_days": 60, "nutrition_macros": false, "offline": false}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- VIP Pro
INSERT INTO app_plans (id, name, price_cents, interval, description, features, limits, created_at)
VALUES (
  'vip_pro', 
  'VIP Pro', 
  5990, 
  'month', 
  'Mais uso diário, mais planos, mais consistência.',
  '["Coach IA (40 msg/dia)", "Workout Wizard (3/semana)", "Histórico Ilimitado", "Macros Completos", "Modo Offline"]'::jsonb,
  '{"chat_daily": 40, "wizard_weekly": 3, "history_days": null, "nutrition_macros": true, "offline": true}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- VIP Elite
INSERT INTO app_plans (id, name, price_cents, interval, description, features, limits, created_at)
VALUES (
  'vip_elite', 
  'VIP Elite', 
  9990, 
  'month', 
  'Alta intensidade de uso com fair use.',
  '["Coach IA Ilimitado", "Workout Wizard Ilimitado", "Chef IA", "Analytics Avançado"]'::jsonb,
  '{"chat_daily": 9999, "wizard_weekly": 9999, "history_days": null, "nutrition_macros": true, "offline": true, "chef_ai": true}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- Atualizar planos anuais também
-- VIP Start Anual
INSERT INTO app_plans (id, name, price_cents, interval, description, features, limits, created_at)
VALUES (
  'vip_start_annual', 
  'VIP Start (Anual)', 
  29900, 
  'year', 
  '2 meses de desconto no plano Start.',
  '["Coach IA (10 msg/dia)", "Workout Wizard (1/semana)", "Histórico 60 dias"]'::jsonb,
  '{"chat_daily": 10, "wizard_weekly": 1, "history_days": 60, "nutrition_macros": false, "offline": false}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- VIP Pro Anual
INSERT INTO app_plans (id, name, price_cents, interval, description, features, limits, created_at)
VALUES (
  'vip_pro_annual', 
  'VIP Pro (Anual)', 
  59900, 
  'year', 
  '2 meses de desconto no plano Pro.',
  '["Coach IA (40 msg/dia)", "Workout Wizard (3/semana)", "Histórico Ilimitado", "Macros Completos", "Modo Offline"]'::jsonb,
  '{"chat_daily": 40, "wizard_weekly": 3, "history_days": null, "nutrition_macros": true, "offline": true}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- VIP Elite Anual
INSERT INTO app_plans (id, name, price_cents, interval, description, features, limits, created_at)
VALUES (
  'vip_elite_annual', 
  'VIP Elite (Anual)', 
  99900, 
  'year', 
  '2 meses de desconto no plano Elite.',
  '["Coach IA Ilimitado", "Workout Wizard Ilimitado", "Chef IA", "Analytics Avançado"]'::jsonb,
  '{"chat_daily": 9999, "wizard_weekly": 9999, "history_days": null, "nutrition_macros": true, "offline": true, "chef_ai": true}'::jsonb,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;
