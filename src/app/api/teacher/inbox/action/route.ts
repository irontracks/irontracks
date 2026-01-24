import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isKind = (v: string) => v === 'churn_risk' || v === 'volume_drop' || v === 'load_spike'

export async function POST(req: Request) {
  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  try {
    const body: any = await req.json().catch(() => ({}))
    const studentUserId = String(body?.student_user_id || '').trim()
    const kind = String(body?.kind || '').trim()
    const action = String(body?.action || '').trim().toLowerCase()
    const snoozeMinutes = Number(body?.snooze_minutes ?? 0)

    if (!studentUserId) return jsonError(400, 'student_user_id_required')
    if (!isKind(kind)) return jsonError(400, 'invalid_kind')
    if (action !== 'done' && action !== 'open' && action !== 'snooze') return jsonError(400, 'invalid_action')

    const requesterId = String(auth.user.id)
    const admin = createAdminClient()

    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('id').eq('user_id', studentUserId).eq('teacher_id', requesterId).maybeSingle()
      if (!s?.id) return jsonError(403, 'forbidden')
    }

    const status = action === 'done' ? 'done' : action === 'snooze' ? 'snoozed' : 'open'
    const snoozeUntil =
      action === 'snooze' && Number.isFinite(snoozeMinutes) && snoozeMinutes > 0
        ? new Date(Date.now() + Math.min(60 * 24 * 7, Math.floor(snoozeMinutes)) * 60 * 1000).toISOString()
        : null

    const payload = {
      coach_id: requesterId,
      student_user_id: studentUserId,
      kind,
      status,
      snooze_until: snoozeUntil,
      updated_at: new Date().toISOString(),
    }

    const { error } = await admin.from('coach_inbox_states').upsert(payload, { onConflict: 'coach_id,student_user_id,kind' })
    if (error) return jsonError(400, error.message)

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e))
  }
}

