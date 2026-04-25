import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 00:00 UTC (21:00 BRT). For each user whose current
 * streak is ≥ 3 and who has NOT trained today (UTC), sends a self push to
 * preserve the streak.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const todayKey = new Date().toISOString().slice(0, 10)
    const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

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
      const date = String((r as { date?: string })?.date || '').slice(0, 10)
      if (!uid || !date) continue
      if (!datesByUser.has(uid)) datesByUser.set(uid, new Set())
      datesByUser.get(uid)!.add(date)
    }

    const atRisk: string[] = []
    datesByUser.forEach((set, uid) => {
      if (set.has(todayKey)) return // already trained today
      // Compute streak ending yesterday
      let cursor = new Date(Date.now() - 24 * 60 * 60 * 1000)
      let streak = 0
      while (streak < 365) {
        const key = cursor.toISOString().slice(0, 10)
        if (!set.has(key)) break
        streak += 1
        cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
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
