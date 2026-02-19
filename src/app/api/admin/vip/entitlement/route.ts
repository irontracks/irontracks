import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z
  .object({
    id: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined), z.string().uuid().optional()),
    email: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : undefined),
      z.string().email().optional(),
    ),
  })
  .strict()

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const parsedQuery = parseSearchParams(req, QuerySchema)
    if (parsedQuery.response) return parsedQuery.response
    const { id, email } = parsedQuery.data!

    if (!id && !email) {
      return NextResponse.json({ ok: false, error: 'missing id/email' }, { status: 400 })
    }

    const admin = createAdminClient()

    let userId = id || ''
    if (!userId && email) {
      const { data: profile } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
      userId = String(profile?.id || '').trim()
    }

    if (!userId) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    const entitlement = await getVipPlanLimits(admin, userId)
    return NextResponse.json({ ok: true, user_id: userId, entitlement })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
  }
}
