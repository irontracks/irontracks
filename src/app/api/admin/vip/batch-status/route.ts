import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
    user_ids: z.array(z.string().uuid()).min(1).max(200),
}).strip()

export type VipBatchEntry = {
    tier: string
    plan_id: string | null
    valid_until: string | null
    source: string
    status: string | null
}

export type VipBatchResult = Record<string, VipBatchEntry>

export async function POST(req: Request) {
    try {
        const auth = await requireRoleOrBearer(req, ['admin', 'teacher'])
        if (!auth.ok) return auth.response

        const parsed = await parseJsonBody(req, BodySchema)
        if (parsed.response) return parsed.response
        const { user_ids } = parsed.data!

        const admin = createAdminClient()

        // 1. Get roles from profiles
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, role')
            .in('id', user_ids)

        const roleMap = new Map<string, string>()
        for (const p of profiles || []) {
            if (p.role) roleMap.set(p.id, p.role)
        }

        // 2. Get active entitlements
        const { data: entitlements } = await admin
            .from('user_entitlements')
            .select('user_id, plan_id, status, provider, valid_until')
            .in('user_id', user_ids)
            .in('status', ['active', 'trialing', 'past_due'])
            .order('valid_until', { ascending: false, nullsFirst: true })

        // 3. Get app_subscriptions (legacy fallback)
        const { data: appSubs } = await admin
            .from('app_subscriptions')
            .select('user_id, plan_id, status')
            .in('user_id', user_ids)
            .in('status', ['active', 'past_due', 'trialing'])
            .order('created_at', { ascending: false })

        // Build entitlement map (first match per user = best)
        const entMap = new Map<string, { plan_id: string; valid_until: string | null; status: string; provider: string }>()
        for (const e of entitlements || []) {
            if (!entMap.has(e.user_id)) {
                entMap.set(e.user_id, {
                    plan_id: e.plan_id || '',
                    valid_until: e.valid_until || null,
                    status: e.status || '',
                    provider: e.provider || '',
                })
            }
        }

        // Build app_subscriptions map (fallback)
        const subMap = new Map<string, { plan_id: string; status: string }>()
        for (const s of appSubs || []) {
            if (!subMap.has(s.user_id)) {
                subMap.set(s.user_id, {
                    plan_id: s.plan_id || '',
                    status: s.status || '',
                })
            }
        }

        const normalizeTier = (planId: string) => {
            const raw = planId.toLowerCase().replace(/\s+/g, '_')
            const match = raw.match(/^vip_(start|pro|elite)/)
            return match ? `vip_${match[1]}` : raw || 'free'
        }

        // 4. Build result
        const result: VipBatchResult = {}
        for (const uid of user_ids) {
            const role = roleMap.get(uid)
            // Admin/Teacher = VIP Elite by role
            if (role === 'admin' || role === 'teacher') {
                result[uid] = { tier: 'vip_elite', plan_id: null, valid_until: null, source: 'role', status: null }
                continue
            }
            // Check user_entitlements
            const ent = entMap.get(uid)
            if (ent) {
                result[uid] = {
                    tier: normalizeTier(ent.plan_id),
                    plan_id: ent.plan_id,
                    valid_until: ent.valid_until,
                    source: ent.provider || 'entitlement_table',
                    status: ent.status,
                }
                continue
            }
            // Check app_subscriptions (legacy)
            const sub = subMap.get(uid)
            if (sub) {
                result[uid] = {
                    tier: normalizeTier(sub.plan_id),
                    plan_id: sub.plan_id,
                    valid_until: null,
                    source: 'app_subscription',
                    status: sub.status,
                }
                continue
            }
            // Free
            result[uid] = { tier: 'free', plan_id: null, valid_until: null, source: 'none', status: null }
        }

        return NextResponse.json({ ok: true, vip: result })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
    }
}
