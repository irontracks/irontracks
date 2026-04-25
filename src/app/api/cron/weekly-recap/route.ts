import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Weekly cron — fires Monday at 11:00 UTC (08:00 BRT). For each user with
 * at least one workout in the previous ISO week (Mon-Sun), sends a recap
 * push with the workout count.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const now = new Date()
    // Previous week range: from last Monday 00:00 UTC to last Sunday 23:59 UTC.
    const dow = now.getUTCDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const daysSinceLastMonday = ((dow + 6) % 7) + 7
    const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceLastMonday)
    const endMs = startMs + 7 * 24 * 60 * 60 * 1000
    const startISO = new Date(startMs).toISOString().slice(0, 10)
    const endISO = new Date(endMs).toISOString().slice(0, 10)

    const { data: rows } = await admin
      .from('workouts')
      .select('user_id')
      .eq('is_template', false)
      .gte('date', startISO)
      .lt('date', endISO)
      .limit(50000)

    const countByUser = new Map<string, number>()
    for (const r of Array.isArray(rows) ? rows : []) {
      const uid = String((r as { user_id?: string })?.user_id || '').trim()
      if (!uid) continue
      countByUser.set(uid, (countByUser.get(uid) || 0) + 1)
    }

    if (!countByUser.size) return NextResponse.json({ ok: true, sent: 0 })

    const notifs: Array<Record<string, unknown>> = []
    countByUser.forEach((count, uid) => {
      notifs.push({
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'weekly_recap',
        title: 'Resumo da semana 📊',
        message: `Você fez ${count} treino${count > 1 ? 's' : ''} na semana passada. Bora pra mais uma!`,
        is_read: false,
        metadata: { workouts: count, week_start: startISO, week_end: endISO },
      })
    })

    await insertNotifications(notifs)
    return NextResponse.json({ ok: true, sent: notifs.length })
  } catch (e) {
    logError('cron:weekly-recap', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
