import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const auth = await requireRoleOrBearer(req, ['admin'])
        if (!auth.ok) return auth.response

        const admin = createAdminClient()

        // 1. Get entitlements from user_entitlements
        const { data: entRows } = await admin
            .from('user_entitlements')
            .select('id, user_id, plan_id, status, provider, provider_subscription_id, valid_from, valid_until, current_period_end, created_at')
            .in('status', ['active', 'trialing', 'past_due'])
            .order('created_at', { ascending: false })
            .limit(500)

        // 2. Get subscriptions from app_subscriptions (legacy)
        const { data: subRows } = await admin
            .from('app_subscriptions')
            .select('id, user_id, plan_id, status, created_at')
            .in('status', ['active', 'past_due', 'trialing'])
            .order('created_at', { ascending: false })
            .limit(500)

        // 3. Get admin/teacher profiles (they're VIP Elite by role)
        const { data: elevatedProfiles } = await admin
            .from('profiles')
            .select('id, email, display_name, role')
            .in('role', ['admin', 'teacher'])

        // Build deduplicated user_id set for profile lookup
        const allUserIds = new Set<string>()
        for (const r of entRows || []) allUserIds.add(r.user_id)
        for (const r of subRows || []) allUserIds.add(r.user_id)
        for (const p of elevatedProfiles || []) allUserIds.add(p.id)

        // Get profiles for all users
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, email, display_name, role')
            .in('id', [...allUserIds])

        const profileMap = new Map<string, { email: string; name: string; role: string }>()
        for (const p of profiles || []) {
            profileMap.set(p.id, {
                email: p.email || '',
                name: p.display_name || '',
                role: p.role || '',
            })
        }

        // Build items list — deduplicate by user_id (entitlements take priority)
        const seen = new Set<string>()
        const items: Array<Record<string, unknown>> = []

        const normalizeTier = (planId: string | null) => {
            const raw = String(planId || '').toLowerCase().replace(/\s+/g, '_')
            const match = raw.match(/^vip_(start|pro|elite)/)
            return match ? `vip_${match[1]}` : raw || 'unknown'
        }

        // Entitlements first (priority)
        for (const r of entRows || []) {
            if (seen.has(r.user_id)) continue
            seen.add(r.user_id)
            const profile = profileMap.get(r.user_id)
            items.push({
                id: r.id,
                user_id: r.user_id,
                email: profile?.email || '',
                name: profile?.name || '',
                role: profile?.role || '',
                tier: normalizeTier(r.plan_id),
                plan_id: r.plan_id,
                status: r.status,
                provider: r.provider || 'entitlement',
                valid_from: r.valid_from,
                valid_until: r.valid_until,
                current_period_end: r.current_period_end,
                created_at: r.created_at,
                source_table: 'user_entitlements',
            })
        }

        // App subscriptions (legacy fallback)
        for (const r of subRows || []) {
            if (seen.has(r.user_id)) continue
            seen.add(r.user_id)
            const profile = profileMap.get(r.user_id)
            items.push({
                id: r.id,
                user_id: r.user_id,
                email: profile?.email || '',
                name: profile?.name || '',
                role: profile?.role || '',
                tier: normalizeTier(r.plan_id),
                plan_id: r.plan_id,
                status: r.status,
                provider: 'app_subscription',
                valid_from: null,
                valid_until: null,
                current_period_end: null,
                created_at: r.created_at,
                source_table: 'app_subscriptions',
            })
        }

        // Admins/Teachers (VIP by role, not in entitlements)
        for (const p of elevatedProfiles || []) {
            if (seen.has(p.id)) continue
            seen.add(p.id)
            items.push({
                id: `role_${p.id}`,
                user_id: p.id,
                email: p.email || '',
                name: p.display_name || '',
                role: p.role || '',
                tier: 'vip_elite',
                plan_id: null,
                status: 'active',
                provider: 'role',
                valid_from: null,
                valid_until: null,
                current_period_end: null,
                created_at: null,
                source_table: 'profiles',
            })
        }

        return NextResponse.json({ ok: true, items })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
    }
}
