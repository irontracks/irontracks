import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isCronAuthorized } from '@/utils/cron/auth'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

// live_activity_push_tokens keeps one row per (user_id, kind, activity_id).
// Every Live Activity restart (recreating instead of updating one already
// alive) or normal session end leaves its row behind — reactive cleanup only
// happens if a push is later attempted against that exact token and Apple
// replies BadDeviceToken/Unregistered (see sendOneLiveActivity in
// src/lib/push/apnsLiveActivity.ts). Rows that never get pushed to again pile
// up forever. No Live Activity in this app runs anywhere near 24h (workout LA
// staleDate caps at 12h from start; rest LA staleDate is start/end + a few
// minutes), so anything older is safe to prune unconditionally.
const CUTOFF_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const admin = createAdminClient()
    const cutoffIso = new Date(Date.now() - CUTOFF_MS).toISOString()

    const { data, error } = await admin
      .from('live_activity_push_tokens')
      .delete()
      .lt('updated_at', cutoffIso)
      .select('user_id')

    if (error) {
      const code = String(error.code || '').toLowerCase()
      const tableMissing = code === '42p01' || code === 'pgrst205' || /does not exist|schema cache|could not find the table/i.test(error.message || '')
      if (tableMissing) return NextResponse.json({ ok: true, deferred: true })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const deletedRows = Array.isArray(data) ? data.length : 0

    await admin.from('audit_events').insert({
      actor_role: 'service',
      action: 'cron_clean_live_activity_tokens',
      entity_type: 'cron',
      metadata: { cutoffIso, deletedRows },
    })

    return NextResponse.json({ ok: true, cutoffIso, deletedRows })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
