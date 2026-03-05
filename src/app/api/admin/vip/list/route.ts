import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        let auth = await requireRole(['admin'])
        if (!auth.ok) {
            auth = await requireRoleWithBearer(req, ['admin'])
            if (!auth.ok) return auth.response
        }

        const admin = createAdminClient()
        const nowIso = new Date().toISOString()

        // All active entitlements with profile info
        const { data: rows, error } = await admin
            .from('user_entitlements')
            .select(`
        id,
        user_id,
        plan_id,
        status,
        provider,
        provider_subscription_id,
        valid_from,
        valid_until,
        current_period_end,
        created_at
      `)
            .in('status', ['active', 'trialing', 'past_due'])
            .lte('valid_from', nowIso)
            .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
            .order('created_at', { ascending: false })
            .limit(500)

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }

        // Get profile info for all users
        const userIds = [...new Set((rows || []).map(r => r.user_id))]
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, email, display_name, role')
            .in('id', userIds)

        const profileMap = new Map<string, { email: string; name: string; role: string }>()
        for (const p of profiles || []) {
            profileMap.set(p.id, {
                email: p.email || '',
                name: p.display_name || '',
                role: p.role || '',
            })
        }

        const items = (rows || []).map(r => {
            const profile = profileMap.get(r.user_id)
            const raw = String(r.plan_id || '').toLowerCase().replace(/\s+/g, '_')
            const match = raw.match(/^vip_(start|pro|elite)/)
            const tier = match ? `vip_${match[1]}` : raw || 'unknown'

            return {
                id: r.id,
                user_id: r.user_id,
                email: profile?.email || '',
                name: profile?.name || '',
                role: profile?.role || '',
                tier,
                plan_id: r.plan_id,
                status: r.status,
                provider: r.provider,
                valid_from: r.valid_from,
                valid_until: r.valid_until,
                current_period_end: r.current_period_end,
                created_at: r.created_at,
            }
        })

        return NextResponse.json({ ok: true, items })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
    }
}
