import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { brtDateKey, brtDateKeyDaysAgo } from '@/utils/cron/dateBrt'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 00:00 UTC (21:00 BRT). For each user whose current
 * streak is ≥ 3 and who has NOT trained today (BRT), sends a self push to
 * preserve the streak.
 *
 * Timezone correctness
 * ────────────────────
 * `workouts.date` is a UTC timestamp; the user's "hoje" is BRT. We bucket
 * every workout by its BRT calendar day (via `brtDateKey`) and compare
 * against the BRT "today". Using `new Date().toISOString().slice(0,10)`
 * here would silently mis-count: at 00:00 UTC the UTC string is already
 * the next day, but it's still 21:00 of the same day in BRT — every
 * afternoon-trainer would be flagged at-risk.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const todayKey = brtDateKey()
    // Pull the last ~31 BRT days. We over-fetch by one UTC day on each side
    // so timestamps near the BRT day boundary don't get clipped.
    const sinceIso = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: rows } = await admin
      .from('workouts')
      .select('user_id, date')
      .eq('is_template', false)
      .gte('date', sinceIso)
      .order('date', { ascending: false })
      .limit(20000)

    const datesByUser = new Map<string, Set<string>>()
    for (const r of Array.isArray(rows) ? rows : []) {
      const uid = String((r as { user_id?: string })?.user_id || '').trim()
      const rawDate = (r as { date?: string })?.date
      if (!uid || !rawDate) continue
      // Convert the UTC timestamp to a BRT calendar-day key.
      const brtKey = brtDateKey(rawDate)
      if (!brtKey) continue
      if (!datesByUser.has(uid)) datesByUser.set(uid, new Set())
      datesByUser.get(uid)!.add(brtKey)
    }

    const atRisk: string[] = []
    datesByUser.forEach((set, uid) => {
      if (set.has(todayKey)) return // already trained today (BRT)
      // Compute streak ending yesterday (BRT)
      let daysAgo = 1
      let streak = 0
      while (streak < 365) {
        const key = brtDateKeyDaysAgo(daysAgo)
        if (!set.has(key)) break
        streak += 1
        daysAgo += 1
      }
      if (streak >= 3) atRisk.push(uid)
    })

    if (!atRisk.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      atRisk.map((uid) => ({
        user_id: uid,
        recipient_id: uid,
        sender_id: uid,
        type: 'streak_at_risk',
        title: 'Sua sequência está em risco 🔥',
        message: 'Você ainda não treinou hoje. Mantém o streak vivo!',
        is_read: false,
        metadata: {},
      })),
    )
    return NextResponse.json({ ok: true, sent: atRisk.length })
  } catch (e) {
    logError('cron:streak-at-risk', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
