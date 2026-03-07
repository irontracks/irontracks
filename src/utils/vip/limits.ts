import { createClient } from '@/utils/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { logError, logWarn, logInfo } from '@/lib/logger'

export type VipTierLimits = {
  chat_daily: number
  wizard_weekly: number
  insights_weekly: number // New limit
  history_days: number | null // null = unlimited
  nutrition_macros: boolean
  analytics: boolean
  offline: boolean
  chef_ai: boolean
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
  chat_daily: 0,
  wizard_weekly: 0,
  insights_weekly: 0,
  history_days: 30,
  nutrition_macros: false,
  analytics: false,
  offline: false,
  chef_ai: false
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
  chef_ai: true
}

const normalizePlanId = (raw: unknown) => {
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

const applyTierDefaults = (tier: string, limits: VipTierLimits) => {
  try {
    const normalized = normalizePlanId(tier)
    if (normalized === 'vip_elite') {
      return { ...limits, nutrition_macros: true, analytics: true, offline: true, chef_ai: true }
    }
    if (normalized === 'vip_pro') {
      return { ...limits, offline: true }
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

const applyTierCaps = (tier: string, limits: VipTierLimits) => {
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
      }
    }
    if (normalized === 'vip_elite') {
      return {
        ...limits,
        chat_daily: capNumber(limits.chat_daily, 9999),
        insights_weekly: capNumber(limits.insights_weekly, 9999),
        wizard_weekly: capNumber(limits.wizard_weekly, 9999),
        history_days: null,
        nutrition_macros: true,
        analytics: true,
        offline: true,
        chef_ai: true,
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
  const { data: appSub } = await supabase
    .from('app_subscriptions')
    .select('id, plan_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'trialing'])
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

const toTzParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})
  const weekday = String(map.weekday || '').toLowerCase()
  const weekdayIndex =
    weekday === 'mon' ? 1 : weekday === 'tue' ? 2 : weekday === 'wed' ? 3 : weekday === 'thu' ? 4 : weekday === 'fri' ? 5 : weekday === 'sat' ? 6 : 0
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex,
  }
}

const tzDateToUtc = (timeZone: string, year: number, month: number, day: number, hour: number, minute: number, second: number) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const tzDate = new Date(utcGuess.toLocaleString('en-US', { timeZone }))
  const offset = utcGuess.getTime() - tzDate.getTime()
  return new Date(utcGuess.getTime() + offset)
}

const getWeeklyResetStart = (now: Date) => {
  const timeZone = 'America/Sao_Paulo'
  const currentParts = toTzParts(now, timeZone)
  const daysSinceMonday = (currentParts.weekdayIndex + 6) % 7
  const mondayDay = currentParts.day - daysSinceMonday
  const weekStart = tzDateToUtc(timeZone, currentParts.year, currentParts.month, mondayDay, 3, 0, 0)
  if (now.getTime() < weekStart.getTime()) {
    const prevMonday = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    return prevMonday
  }
  return weekStart
}

export async function checkVipFeatureAccess(
  supabase: SupabaseClient, 
  userId: string, 
  feature: keyof VipTierLimits
): Promise<{ allowed: boolean, currentUsage: number, limit: number | null, tier: string }> {
  const { tier, limits } = await getVipPlanLimits(supabase, userId)
  const normalizedTier = normalizePlanId(tier)
  if (feature === 'chef_ai' && normalizedTier !== 'vip_elite') {
    return { allowed: false, currentUsage: 0, limit: 0, tier }
  }
  if (feature === 'analytics' && normalizedTier !== 'vip_elite') {
    return { allowed: false, currentUsage: 0, limit: 0, tier }
  }
  if (feature === 'nutrition_macros' && normalizedTier !== 'vip_pro' && normalizedTier !== 'vip_elite') {
    return { allowed: false, currentUsage: 0, limit: 0, tier }
  }
  if (feature === 'offline' && normalizedTier !== 'vip_pro' && normalizedTier !== 'vip_elite') {
    return { allowed: false, currentUsage: 0, limit: 0, tier }
  }
  const limit = limits[feature]

  // Boolean features (macros, offline, chef_ai)
  if (typeof limit === 'boolean') {
    return { allowed: limit, currentUsage: 0, limit: limit ? 1 : 0, tier }
  }

  // Null means unlimited
  if (limit === null) {
    return { allowed: true, currentUsage: 0, limit: null, tier }
  }

  // Numeric limits (chat_daily, wizard_weekly)
  if (feature === 'chat_daily') {
    const today = new Date().toISOString().split('T')[0]
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
  
  // Upsert usage
  // We can't use .rpc() unless we have a specific function, so we'll try insert/update
  // Or better, use upsert with on conflict
  
  const { data: existing } = await supabase
    .from('vip_usage_daily')
    .select('usage_count')
    .eq('user_id', userId)
    .eq('feature_key', feature)
    .eq('day', today)
    .maybeSingle()

  const nextCount = (existing?.usage_count || 0) + 1

  const { error } = await supabase
    .from('vip_usage_daily')
    .upsert({
      user_id: userId,
      feature_key: feature,
      day: today,
      usage_count: nextCount,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id, feature_key, day' })
    
  if (error) logError('error', 'Error incrementing VIP usage:', error)
}
