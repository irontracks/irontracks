import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('dedupe_direct_channels')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    const row = Array.isArray(data) && data.length ? data[0] : { pairs_affected: 0, channels_deduped: 0, messages_moved: 0 }
    return NextResponse.json({ ok: true, report: row })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

