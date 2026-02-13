import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'

export const dynamic = 'force-dynamic'

const looksLikeUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const url = new URL(req.url)
    const idRaw = String(url.searchParams.get('id') || '').trim()
    const emailRaw = String(url.searchParams.get('email') || '').trim().toLowerCase()

    if (!idRaw && !emailRaw) {
      return NextResponse.json({ ok: false, error: 'missing id/email' }, { status: 400 })
    }

    const admin = createAdminClient()

    let userId = ''
    if (idRaw && looksLikeUuid(idRaw)) userId = idRaw

    if (!userId && emailRaw) {
      const { data: profile } = await admin.from('profiles').select('id').ilike('email', emailRaw).maybeSingle()
      userId = String(profile?.id || '').trim()
    }

    if (!userId) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    const entitlement = await getVipPlanLimits(admin, userId)
    return NextResponse.json({ ok: true, user_id: userId, entitlement })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
