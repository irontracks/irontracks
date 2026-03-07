import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { hasValidInternalSecret, requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!hasValidInternalSecret(req)) {
      const auth = await requireRole(['admin'])
      if (!auth.ok) return auth.response
    }
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('dedupe_direct_channels')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    const row = Array.isArray(data) && data.length ? data[0] : { pairs_affected: 0, channels_deduped: 0, messages_moved: 0 }
    return NextResponse.json({ ok: true, report: row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
