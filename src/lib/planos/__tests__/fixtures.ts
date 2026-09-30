import type { LinhaAppPlan, LinhaTeacherTier } from '../publicos'

/**
 * Linhas no formato REAL de `app_plans` / `teacher_tiers` (lidas do banco em
 * 30/09/2026), inclusive as inativas `vip_*_month`/`vip_*_year` que a tabela
 * guarda com o mesmo valor — é o que o filtro tem de ignorar.
 */
const limitesStart = { offline: false, lab_exams: true, chat_daily: 10, history_days: 60, wizard_weekly: 1, insights_weekly: 3, nutrition_macros: false }
const limitesPro = { offline: true, lab_exams: true, chat_daily: 40, history_days: null, wizard_weekly: 3, insights_weekly: 7, nutrition_macros: true }
const limitesElite = { chef_ai: true, offline: true, lab_exams: true, chat_daily: 9999, history_days: null, wizard_weekly: 9999, insights_weekly: 9999, nutrition_macros: true }

export const APP_PLANS: LinhaAppPlan[] = [
  { id: 'vip_start', name: 'VIP Start', interval: 'month', price_cents: 2990, currency: 'BRL', status: 'active', limits: limitesStart },
  { id: 'vip_start_annual', name: 'VIP Start (Anual)', interval: 'year', price_cents: 29900, currency: 'BRL', status: 'active', limits: limitesStart },
  { id: 'vip_pro', name: 'VIP Pro', interval: 'month', price_cents: 5990, currency: 'BRL', status: 'active', limits: limitesPro },
  { id: 'vip_pro_annual', name: 'VIP Pro (Anual)', interval: 'year', price_cents: 59900, currency: 'BRL', status: 'active', limits: limitesPro },
  { id: 'vip_elite', name: 'VIP Elite', interval: 'month', price_cents: 9990, currency: 'BRL', status: 'active', limits: limitesElite },
  { id: 'vip_elite_annual', name: 'VIP Elite (Anual)', interval: 'year', price_cents: 99900, currency: 'BRL', status: 'active', limits: limitesElite },
  // inativas — o banco as guarda com o mesmo valor; nunca podem virar cartão
  { id: 'vip_pro_month', name: 'VIP Pro', interval: 'month', price_cents: 5990, currency: 'BRL', status: 'inactive', limits: limitesPro },
  { id: 'vip_pro_year', name: 'VIP Pro (Anual)', interval: 'year', price_cents: 59900, currency: 'BRL', status: 'inactive', limits: limitesPro },
]

export const TEACHER_TIERS: LinhaTeacherTier[] = [
  { tier_key: 'elite', name: 'Elite', description: 'Para personal trainers de alto volume', max_students: 100, price_cents: 17900, currency: 'BRL', sort_order: 3, is_active: true },
  { tier_key: 'free', name: 'Free', description: 'Ideal para experimentar a plataforma', max_students: 2, price_cents: 0, currency: 'BRL', sort_order: 0, is_active: true },
  { tier_key: 'pro', name: 'Pro', description: 'Para personal trainers estabelecidos', max_students: 40, price_cents: 9700, currency: 'BRL', sort_order: 2, is_active: true },
  { tier_key: 'starter', name: 'Starter', description: 'Para personal trainers iniciantes', max_students: 15, price_cents: 4900, currency: 'BRL', sort_order: 1, is_active: true },
  { tier_key: 'unlimited', name: 'Unlimited', description: 'Para academias e franquias — alunos ilimitados', max_students: 0, price_cents: 24900, currency: 'BRL', sort_order: 4, is_active: true },
]
