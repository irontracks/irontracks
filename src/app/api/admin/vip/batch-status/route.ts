import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
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
        let auth = await requireRole(['admin', 'teacher'])
        if (!auth.ok) {
            auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
            if (!auth.ok) return auth.response
        }

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
        const nowIso = new Date().toISOString()
        const { data: entitlements } = await admin
            .from('user_entitlements')
            .select('user_id, plan_id, status, provider, valid_until')
            .in('user_id', user_ids)
            .in('status', ['active', 'trialing', 'past_due'])
            .lte('valid_from', nowIso)
            .or(`valid_until.is.null,valid_until.gte.${nowIso}`)
            .order('valid_until', { ascending: false, nullsFirst: true })

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

        // 3. Build result
        const result: VipBatchResult = {}
        for (const uid of user_ids) {
            const role = roleMap.get(uid)
            if (role === 'admin' || role === 'teacher') {
                result[uid] = { tier: 'vip_elite', plan_id: null, valid_until: null, source: 'role', status: null }
                continue
            }
            const ent = entMap.get(uid)
            if (ent) {
                // Normalize tier
                const raw = String(ent.plan_id || '').toLowerCase().replace(/\s+/g, '_')
                const match = raw.match(/^vip_(start|pro|elite)/)
                const tier = match ? `vip_${match[1]}` : raw || 'free'
                result[uid] = {
                    tier,
                    plan_id: ent.plan_id,
                    valid_until: ent.valid_until,
                    source: ent.provider || 'entitlement_table',
                    status: ent.status,
                }
            } else {
                result[uid] = { tier: 'free', plan_id: null, valid_until: null, source: 'none', status: null }
            }
        }

        return NextResponse.json({ ok: true, vip: result })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
    }
}
