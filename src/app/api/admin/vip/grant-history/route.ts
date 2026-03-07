import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

const QuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strip()

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const parsed = parseSearchParams(req, QuerySchema)
    if (parsed.response) return parsed.response
    const { limit } = parsed.data!

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('audit_events')
      .select('id, created_at, actor_id, actor_email, actor_role, action, entity_type, entity_id, metadata')
      .eq('action', 'vip_trial_grant')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, rows: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
