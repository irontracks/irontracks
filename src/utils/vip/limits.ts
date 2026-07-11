import { SupabaseClient } from '@supabase/supabase-js'
import { logError, logWarn } from '@/lib/logger'
import { getWeeklyResetStart } from './weekReset'

export type VipTierLimits = {
  chat_daily: number
  wizard_weekly: number
  insights_weekly: number // New limit
  history_days: number | null // null = unlimited
  nutrition_macros: boolean
  analytics: boolean
  offline: boolean
  chef_ai: boolean
  lab_exams: boolean // análise de exames laboratoriais por IA (Gemini Pro) — pro+
}

export type VipEntitlementSource =
  | 'role'
  | 'entitlement_table'
  | 'app_subscription'
  | 'free_no_subscription'
  | 'entitlement_missing_plan'
  | 'entitlement_invalid'
  | 'app_subscription_missing_plan'

export type VipPlanResult = {
  tier: string
  limits: VipTierLimits
  source: VipEntitlementSource
  debug?: Record<string, unknown>
}

export const FREE_LIMITS: VipTierLimits = {
  chat_daily: 5,        // 5 mensagens/semana (free usa período weekly)
  wizard_weekly: 3,     // 3 gerações do Wizard por semana
  insights_weekly: 2,   // 2 insights por semana
  history_days: 30,
  nutrition_macros: false,
  analytics: false,
  offline: false,
  chef_ai: false,
  lab_exams: false
}

// Admin/Teacher gets everything unlimited
export const UNLIMITED_LIMITS: VipTierLimits = {
  chat_daily: 9999,
  wizard_weekly: 9999,
  insights_weekly: 9999,
  history_days: null,
  nutrition_macros: true,
  analytics: true,
  offline: true,
  chef_ai: true,
  lab_exams: true
}

export const normalizePlanId = (raw: unknown) => {
  try {
    const base = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
    if (!base) return ''
    const match = base.match(/^vip_(start|pro|elite)(?:_(monthly|month|mensal|annual|year|yearly|anual))?$/)
    if (match) return `vip_${match[1]}`
    return base
  } catch {
    return ''
  }
}

export const applyTierDefaults = (tier: string, limits: VipTierLimits) => {
  try {
    const normalized = normalizePlanId(tier)
    if (normalized === 'vip_elite') {
      return { ...limits, nutrition_macros: true, analytics: true, offline: true, chef_ai: true, lab_exams: true }
    }
    if (normalized === 'vip_pro') {
      return { ...limits, offline: true, lab_exams: true }
    }
    if (normalized === 'vip_start') {
      return { ...limits, lab_exams: true }
    }
    // Qualquer plano VIP não mapeado ainda recebe lab_exams (feature básica de todo VIP).
    // Isso garante que novos planos não fiquem sem acesso por omissão.
    if (normalized.startsWith('vip_')) {
      return { ...limits, lab_exams: true }
    }
    return limits
  } catch {
    return limits
  }
}

const capNumber = (value: unknown, max: number) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return max
  return Math.min(n, max)
}

const capHistory = (value: unknown, max: number) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return max
  return Math.min(n, max)
}

export const applyTierCaps = (tier: string, limits: VipTierLimits) => {
  try {
    const normalized = normalizePlanId(tier)
    if (normalized === 'vip_start') {
      return {
        ...limits,
        chat_daily: capNumber(limits.chat_daily, 10),
        insights_weekly: capNumber(limits.insights_weekly, 3),
        wizard_weekly: capNumber(limits.wizard_weekly, 1),
        history_days: capHistory(limits.history_days, 60),
        nutrition_macros: false,
        analytics: false,
        offline: false,
        chef_ai: false,
        lab_exams: true, // disponível em todo VIP (start/pro/elite)
      }
    }
    if (normalized === 'vip_pro') {
      return {
        ...limits,
        chat_daily: capNumber(limits.chat_daily, 40),
        insights_weekly: capNumber(limits.insights_weekly, 7),
        wizard_weekly: capNumber(limits.wizard_weekly, 3),
        history_days: null,
        nutrition_macros: true,
        analytics: false,
        offline: true,
        chef_ai: false,
        lab_exams: true,
      }
    }
    if (normalized === 'vip_elite') {
      return {
        ...limits,
        chat_daily: 9999,
        insights_weekly: 9999,
        wizard_weekly: 9999,
        history_days: null,
        nutrition_macros: true,
        analytics: true,
        offline: true,
        chef_ai: true,
        lab_exams: true,
      }
    }
    return limits
  } catch {
    return limits
  }
}

export async function getVipPlanLimits(supabase: SupabaseClient, userId: string): Promise<VipPlanResult> {
  // 1. Check Admin/Teacher role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  
  if (profile?.role === 'admin' || profile?.role === 'teacher') {
    return { tier: 'vip_elite', limits: UNLIMITED_LIMITS, source: 'role', debug: { role: profile?.role } }
  }

  // 2. Check Entitlements Table (preferred)
  const nowIso = new Date().toISOString()
  const { data: ent } = await supabase
    .from('user_entitlements')
    .select(
      'id, plan_id, status, provider, provider_subscription_id, valid_from, valid_until, current_period_end, limits_override, created_at',
    )
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .lte('valid_from', nowIso)
    // nowIso vem de new Date().toISOString() (valor do servidor, não input do
    // usuário) — NÃO passar por safePg: ele remove o ponto dos milissegundos
    // ("…20.616Z" → "…20616Z"), o que estoura "date/time out of range" no
    // PostgREST, a query falha e o usuário cai no fallback legacy (plano errado).
    .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
    .order('valid_until', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (ent?.id) {
    const override = ent?.limits_override && typeof ent.limits_override === 'object' ? ent.limits_override : null
    if (override && Object.keys(override).length > 0) {
      const tier = normalizePlanId(ent.plan_id || 'custom') || String(ent.plan_id || 'custom')
      return {
        tier,
        limits: applyTierCaps(tier, applyTierDefaults(tier, { ...FREE_LIMITS, ...(override as Record<string, unknown>) } as VipTierLimits)),
        source: 'entitlement_table',
        debug: {
          entitlement_id: ent.id || null,
          provider: ent.provider || null,
          provider_subscription_id: ent.provider_subscription_id || null,
          entitlement_status: ent.status || null,
          valid_until: ent.valid_until || null,
        },
      }
    }

    if (ent?.plan_id) {
      const tier = normalizePlanId(ent.plan_id) || String(ent.plan_id || '')
      const limits = await fetchPlanLimits(supabase, ent.plan_id)
      if (limits) {
        return {
          tier,
          limits: applyTierCaps(tier, applyTierDefaults(tier, limits)),
          source: 'entitlement_table',
          debug: { entitlement_id: ent.id || null, entitlement_status: ent.status || null },
        }
      }
      logWarn('vip', 'vip_entitlement_missing_plan', {
        source: 'entitlement_table',
        entitlement_id: ent.id || null,
        plan_id: ent.plan_id,
        status: ent.status || null,
      })
      return {
        tier: 'free',
        limits: FREE_LIMITS,
        source: 'entitlement_missing_plan',
        debug: { entitlement_id: ent.id || null, plan_id: ent.plan_id, entitlement_status: ent.status || null },
      }
    }

    return { tier: 'free', limits: FREE_LIMITS, source: 'entitlement_invalid', debug: { entitlement_id: ent.id || null } }
  }

  // 3. Check App Subscriptions (legacy fallback)
  // Filtra a expiração por current_period_end assim como o passo 2 faz com
  // valid_until — sem isto, uma linha presa em status='active' com o período já
  // vencido concederia VIP para sempre. Aceita current_period_end nulo (assinatura
  // manual sem período definido), coerente com o valid_until nulo do entitlement.
  // nowIso vem do servidor (não é input do usuário) — mesmo motivo do passo 2,
  // não passar por safePg (quebraria os milissegundos e estouraria a query).
  const { data: appSub } = await supabase
    .from('app_subscriptions')
    .select('id, plan_id, status, current_period_end')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'trialing'])
    .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (appSub?.plan_id) {
    const tier = normalizePlanId(appSub.plan_id) || String(appSub.plan_id || '')
    const limits = await fetchPlanLimits(supabase, appSub.plan_id)
    if (limits) {
      return {
        tier,
        limits: applyTierCaps(tier, applyTierDefaults(tier, limits)),
        source: 'app_subscription',
        debug: { app_subscription_id: appSub.id || null, app_subscription_status: appSub.status || null },
      }
    }
    logWarn('vip', 'vip_entitlement_missing_plan', {
      source: 'app_subscription',
      app_subscription_id: appSub.id || null,
      plan_id: appSub.plan_id,
      status: appSub.status || null,
    })
    return {
      tier: 'free',
      limits: FREE_LIMITS,
      source: 'app_subscription_missing_plan',
      debug: { app_subscription_id: appSub.id || null, plan_id: appSub.plan_id, app_subscription_status: appSub.status || null },
    }
  }

  // 4. Fallback to Free
  return { tier: 'free', limits: FREE_LIMITS, source: 'free_no_subscription' }
}

async function fetchPlanLimits(supabase: SupabaseClient, planId: string): Promise<VipTierLimits | null> {
  try {
    const normalized = normalizePlanId(planId)
    const ids = normalized && normalized !== planId ? [planId, normalized] : [planId]
    for (const id of ids) {
      const { data: plan } = await supabase
        .from('app_plans')
        .select('limits')
        .eq('id', id)
        .maybeSingle()
      if (plan?.limits) {
        return { ...FREE_LIMITS, ...(plan.limits as Record<string, unknown>) } as VipTierLimits
      }
    }
    return null
  } catch {
    return null
  }
}


// Teto diário ANTI-ABUSO (não é product tier) para features booleanas que disparam
// Gemini. Generoso o bastante pra nunca afetar VIP legítimo; barra custo descontrolado
// (sem isto, dava pra estourar chamadas pagas dentro da janela de rate-limit). Admin/
// teacher (source='role') são isentos. Auditoria 2026-06-28 (R2 — VIP boolean metering).
const BOOLEAN_DAILY_CEILING: Partial<Record<keyof VipTierLimits, number>> = {
  lab_exams: 50,
  nutrition_macros: 200,
  analytics: 150,
}

export async function checkVipFeatureAccess(
  supabase: SupabaseClient,
  userId: string,
  feature: keyof VipTierLimits,
  // opts.plan: resultado de getVipPlanLimits JÁ resolvido pelo caller — evita re-resolver
  // o plano (~3-4 queries) quando a rota checa várias features no mesmo request (ex.:
  // vip/status checava 2 features + 1 resolução direta = 3 resoluções). Opcional e
  // backward-compatible: sem `plan`, resolve internamente como sempre.
  opts?: { meter?: boolean, plan?: VipPlanResult }
): Promise<{ allowed: boolean, currentUsage: number, limit: number | null, tier: string }> {
  const { tier, limits, source } = opts?.plan ?? await getVipPlanLimits(supabase, userId)
  const normalizedTier = normalizePlanId(tier)

  // Fix #7: Check limits object first (respects limits_override from admin)
  // Only fall back to tier-based denial if the limit is explicitly false/0
  const limit = limits[feature]

  // Boolean features — respect the limits object (includes overrides)
  if (typeof limit === 'boolean') {
    if (!limit) return { allowed: false, currentUsage: 0, limit: 0, tier }

    // Teto anti-abuso só pra features que custam Gemini; admin/teacher (source='role')
    // são isentos (unlimited de verdade). Sem teto (ex.: offline) → acesso direto.
    const ceiling = source === 'role' ? undefined : BOOLEAN_DAILY_CEILING[feature]
    if (!ceiling) return { allowed: true, currentUsage: 0, limit: 1, tier }

    const today = new Date().toISOString().split('T')[0]
    if (opts?.meter) {
      // Consumo real: incrementa atômico (mesmo RPC do M-1) e bloqueia se passar do teto.
      const { data: newCount } = await supabase.rpc('increment_vip_usage_daily', {
        p_user_id: userId, p_feature_key: feature, p_day: today,
      })
      const c = Number(newCount || 0)
      return { allowed: c <= ceiling, currentUsage: c, limit: ceiling, tier }
    }
    // Checagem de display (não consome): só lê a contagem do dia.
    const { data: usage } = await supabase
      .from('vip_usage_daily')
      .select('usage_count')
      .eq('user_id', userId)
      .eq('feature_key', feature)
      .eq('day', today)
      .maybeSingle()
    const c = usage?.usage_count || 0
    return { allowed: c < ceiling, currentUsage: c, limit: ceiling, tier }
  }

  // Null means unlimited
  if (limit === null) {
    return { allowed: true, currentUsage: 0, limit: null, tier }
  }

  // Numeric limits (chat_daily, wizard_weekly)
  if (feature === 'chat_daily') {
    const today = new Date().toISOString().split('T')[0]

    // Consumo atômico ANTES de chamar o modelo (opts.meter): incrementa 'chat' via RPC e
    // bloqueia se passar do limite. Fecha a janela TOCTOU do check-then-act — sem isso, N
    // requests paralelos liam a mesma contagem, todos passavam e queimavam cota de Gemini
    // pago. O RPC seta last_used_at = now(), então a re-soma semanal (free) já inclui este
    // increment. Comparação é `<= limit` (pós-incremento): consumir a N-ésima unidade dá
    // contagem N, permitida enquanto N <= limite. Auditoria 2026-07-02 (PA3 #8).
    if (opts?.meter) {
      const { data: newCount } = await supabase.rpc('increment_vip_usage_daily', {
        p_user_id: userId, p_feature_key: 'chat', p_day: today,
      })
      if (normalizedTier === 'free') {
        const weekStart = getWeeklyResetStart(new Date()).toISOString()
        const { data: usages } = await supabase
          .from('vip_usage_daily')
          .select('usage_count')
          .eq('user_id', userId)
          .eq('feature_key', 'chat')
          .gte('last_used_at', weekStart)
        const current = usages?.reduce((sum, row) => sum + row.usage_count, 0) || 0
        return { allowed: current <= limit, currentUsage: current, limit, tier }
      }
      const c = Number(newCount || 0)
      return { allowed: c <= limit, currentUsage: c, limit, tier }
    }

    if (normalizedTier === 'free') {
      const weekStart = getWeeklyResetStart(new Date()).toISOString()
      const { data: usages } = await supabase
        .from('vip_usage_daily')
        .select('usage_count')
        .eq('user_id', userId)
        .eq('feature_key', 'chat')
        .gte('last_used_at', weekStart)
      const current = usages?.reduce((sum, row) => sum + row.usage_count, 0) || 0
      return { allowed: current < limit, currentUsage: current, limit, tier }
    }

    const { data: usage } = await supabase
      .from('vip_usage_daily')
      .select('usage_count')
      .eq('user_id', userId)
      .eq('feature_key', 'chat')
      .eq('day', today)
      .maybeSingle()
    
    const current = usage?.usage_count || 0
    return { allowed: current < limit, currentUsage: current, limit, tier }
  }

  if (feature === 'wizard_weekly' || feature === 'insights_weekly') {
    const weekStart = getWeeklyResetStart(new Date()).toISOString()
    const dbKey = feature === 'wizard_weekly' ? 'wizard' : 'insights'
    const { data: usages } = await supabase
      .from('vip_usage_daily')
      .select('usage_count')
      .eq('user_id', userId)
      .eq('feature_key', dbKey)
      .gte('last_used_at', weekStart)
    const current = usages?.reduce((sum, row) => sum + row.usage_count, 0) || 0
    return { allowed: current < (limit || 0), currentUsage: current, limit, tier }
  }

  // Default fallback
  return { allowed: false, currentUsage: 0, limit: 0, tier }
}

export async function incrementVipUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: 'chat' | 'wizard' | 'insights'
) {
  const today = new Date().toISOString().split('T')[0]

  // R2#M1: increment ATÔMICO via RPC (UPSERT com usage_count = usage_count + 1 no
  // próprio banco). Substitui o read-then-write anterior, onde o UPDATE com optimistic
  // lock tratava 0-row como sucesso silencioso sob concorrência — dois requests
  // paralelos liam a mesma contagem e perdiam um increment, furando a cota de IA paga
  // (custo Gemini real). A função increment_vip_usage_daily faz INSERT ... ON CONFLICT
  // DO UPDATE, fechando a janela TOCTOU. Auditoria 2026-06-28 (M-1).
  const { error } = await supabase.rpc('increment_vip_usage_daily', {
    p_user_id: userId,
    p_feature_key: feature,
    p_day: today,
  })

  if (error) logError('error', 'Error incrementing VIP usage:', error)
}

/**
 * Reembolsa (decrementa, piso 0) uma unidade de cota consumida no gate (meter) quando a
 * resposta NÃO foi entregue — falha do modelo, config ausente, ou request bloqueado por
 * limite. Assim o usuário só é cobrado por respostas que recebeu, sem reabrir a janela
 * TOCTOU (o gate segue atômico e bloqueia o excedente ANTES de chamar o modelo).
 * Best-effort: erro no reembolso é logado, não propagado. Auditoria 2026-07-02 (PA3).
 */
export async function refundVipUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: 'chat' | 'wizard' | 'insights'
) {
  const today = new Date().toISOString().split('T')[0]
  const { error } = await supabase.rpc('decrement_vip_usage_daily', {
    p_user_id: userId,
    p_feature_key: feature,
    p_day: today,
  })
  if (error) logError('vip:refund', 'Error refunding VIP usage:', error)
}
