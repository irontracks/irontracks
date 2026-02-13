import { createClient } from '@/utils/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'

export type VipTierLimits = {
  chat_daily: number
  wizard_weekly: number
  insights_weekly: number // New limit
  history_days: number | null // null = unlimited
  nutrition_macros: boolean
  offline: boolean
  chef_ai: boolean
}

export type VipEntitlementSource =
  | 'role'
  | 'app_subscription'
  | 'marketplace_subscription'
  | 'free_no_subscription'
  | 'app_subscription_missing_plan'
  | 'marketplace_subscription_missing_plan'

export type VipPlanResult = {
  tier: string
  limits: VipTierLimits
  source: VipEntitlementSource
  debug?: Record<string, any>
}

export const FREE_LIMITS: VipTierLimits = {
  chat_daily: 0,
  wizard_weekly: 0,
  insights_weekly: 1, // 1 per week for Free
  history_days: 30,
  nutrition_macros: false,
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
  offline: true,
  chef_ai: true
}

export async function getVipPlanLimits(supabase: SupabaseClient, userId: string): Promise<VipPlanResult> {
  // 1. Check Admin/Teacher role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  
  if (profile?.role === 'admin' || profile?.role === 'teacher') {
    return { tier: 'admin', limits: UNLIMITED_LIMITS, source: 'role' }
  }

  // 2. Check App Subscriptions (In-App Purchases)
  const { data: appSub } = await supabase
    .from('app_subscriptions')
    .select('id, plan_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (appSub?.plan_id) {
    const limits = await fetchPlanLimits(supabase, appSub.plan_id)
    if (limits) {
      return {
        tier: appSub.plan_id,
        limits,
        source: 'app_subscription',
        debug: { app_subscription_id: appSub.id || null, app_subscription_status: appSub.status || null },
      }
    }
    console.warn('vip_entitlement_missing_plan', {
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

  // 3. Check Marketplace Subscriptions (Stripe/Asaas)
  const { data: marketSub } = await supabase
    .from('marketplace_subscriptions')
    .select('id, plan_id, status')
    .eq('student_user_id', userId)
    .in('status', ['active', 'past_due', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (marketSub?.plan_id) {
    const limits = await fetchPlanLimits(supabase, marketSub.plan_id)
    if (limits) {
      return {
        tier: marketSub.plan_id,
        limits,
        source: 'marketplace_subscription',
        debug: { marketplace_subscription_id: marketSub.id || null, marketplace_subscription_status: marketSub.status || null },
      }
    }
    console.warn('vip_entitlement_missing_plan', {
      source: 'marketplace_subscription',
      marketplace_subscription_id: marketSub.id || null,
      plan_id: marketSub.plan_id,
      status: marketSub.status || null,
    })
    return {
      tier: 'free',
      limits: FREE_LIMITS,
      source: 'marketplace_subscription_missing_plan',
      debug: {
        marketplace_subscription_id: marketSub.id || null,
        plan_id: marketSub.plan_id,
        marketplace_subscription_status: marketSub.status || null,
      },
    }
  }

  // 4. Fallback to Free
  return { tier: 'free', limits: FREE_LIMITS, source: 'free_no_subscription' }
}

async function fetchPlanLimits(supabase: SupabaseClient, planId: string): Promise<VipTierLimits | null> {
  // Normalize planId (remove _annual suffix to match base plan limits if needed, 
  // though we inserted annual plans with limits too)
  
  const { data: plan } = await supabase
    .from('app_plans')
    .select('limits')
    .eq('id', planId)
    .single()

  if (plan?.limits) {
    // Merge with defaults to ensure all keys exist
    return { ...FREE_LIMITS, ...plan.limits }
  }
  
  return null
}

export async function checkVipFeatureAccess(
  supabase: SupabaseClient, 
  userId: string, 
  feature: keyof VipTierLimits
): Promise<{ allowed: boolean, currentUsage: number, limit: number | null, tier: string }> {
  const { tier, limits } = await getVipPlanLimits(supabase, userId)
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
    // Sum usage of last 7 days
    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 6) // -6 days + today = 7 days window
    
    // Map feature to db key
    const dbKey = feature === 'wizard_weekly' ? 'wizard' : 'insights'

    const { data: usages } = await supabase
      .from('vip_usage_daily')
      .select('usage_count')
      .eq('user_id', userId)
      .eq('feature_key', dbKey)
      .gte('day', sevenDaysAgo.toISOString().split('T')[0])
    
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
    
  if (error) console.error('Error incrementing VIP usage:', error)
}
