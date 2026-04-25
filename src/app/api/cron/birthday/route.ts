import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 11:00 UTC (08:00 BRT). Notifies each user on the
 * anniversary of their auth.users.created_at (years ≥ 1 only).
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const today = new Date()
    const m = today.getUTCMonth() + 1
    const d = today.getUTCDate()
    const y = today.getUTCFullYear()

    const matched: Array<{ user_id: string; years: number }> = []
    let page = 1
    while (page < 100) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) break
      const users = data?.users || []
      if (!users.length) break
      for (const u of users) {
        const created = u.created_at ? new Date(u.created_at) : null
        if (!created || Number.isNaN(created.getTime())) continue
        if (created.getUTCMonth() + 1 !== m || created.getUTCDate() !== d) continue
        const years = y - created.getUTCFullYear()
        if (years >= 1) matched.push({ user_id: String(u.id), years })
      }
      if (users.length < 1000) break
      page += 1
    }

    if (!matched.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      matched.map((row) => ({
        user_id: row.user_id,
        recipient_id: row.user_id,
        sender_id: row.user_id,
        type: 'birthday',
        title: 'Aniversário no IronTracks 🎉',
        message: `Você completa ${row.years} ano${row.years > 1 ? 's' : ''} no app hoje. Continua firme!`,
        is_read: false,
        metadata: { years: row.years },
      })),
    )
    return NextResponse.json({ ok: true, sent: matched.length })
  } catch (e) {
    logError('cron:birthday', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
