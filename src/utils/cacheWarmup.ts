import { cacheSet } from '@/utils/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { logWarn } from '@/lib/logger'

/**
 * Pre-populates cache with frequently accessed data for a user.
 * Call this after successful login or session creation.
 */
export async function warmupCacheForUser(userId: string): Promise<void> {
    if (!userId) return

    try {
        const admin = createAdminClient()

        // 1. VIP access status
        const { data: sub } = await admin
            .from('user_subscriptions')
            .select('status, plan_id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle()

        if (sub) {
            await cacheSet(`vip:access:${userId}`, JSON.stringify({ active: true, plan: sub.plan_id }), 300)
        }

        // 2. User profile (role, display_name)
        const { data: profile } = await admin
            .from('profiles')
            .select('role, display_name, photo_url')
            .eq('id', userId)
            .maybeSingle()

        if (profile) {
            await cacheSet(`profile:${userId}`, JSON.stringify(profile), 300)
        }
    } catch (e) {
        logWarn('cacheWarmup', 'Failed to warmup cache for user', e)
    }
}
