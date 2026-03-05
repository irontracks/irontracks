import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { logWarn } from '@/lib/logger'
import { cacheDelete } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
    entitlement_id: z.string().uuid(),
}).strip()

export async function POST(req: Request) {
    try {
        let auth = await requireRole(['admin'])
        if (!auth.ok) {
            auth = await requireRoleWithBearer(req, ['admin'])
            if (!auth.ok) return auth.response
        }

        const parsed = await parseJsonBody(req, BodySchema)
        if (parsed.response) return parsed.response
        const { entitlement_id } = parsed.data!

        const admin = createAdminClient()

        // Get existing
        const { data: ent } = await admin
            .from('user_entitlements')
            .select('id, user_id, plan_id, status')
            .eq('id', entitlement_id)
            .maybeSingle()

        if (!ent?.id) {
            return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
        }

        // Mark as cancelled
        const { error } = await admin
            .from('user_entitlements')
            .update({ status: 'cancelled', valid_until: new Date().toISOString() })
            .eq('id', entitlement_id)

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }

        // Audit
        try {
            await admin.from('audit_events').insert({
                actor_id: auth.user?.id || null,
                actor_email: auth.user?.email || null,
                actor_role: 'admin',
                action: 'vip_revoke',
                entity_type: 'user',
                entity_id: ent.user_id,
                metadata: { entitlement_id, plan_id: ent.plan_id, previous_status: ent.status },
            })
        } catch (e) { logWarn('admin/vip/revoke', 'Failed to write audit_events', e) }

        // Clear cache
        await Promise.all([
            cacheDelete(`vip:access:${ent.user_id}`).catch(() => { }),
            cacheDelete(`dashboard:bootstrap:${ent.user_id}`).catch(() => { }),
        ])

        return NextResponse.json({ ok: true, revoked: entitlement_id, user_id: ent.user_id })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
    }
}
