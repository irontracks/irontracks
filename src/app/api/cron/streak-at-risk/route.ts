import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { brtDateKey } from '@/utils/cron/dateBrt'
import { shouldNotifyStreakAtRisk } from '@/utils/cron/streakRisk'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 00:00 UTC (21:00 BRT). Sends a self push to users
 * whose training week is genuinely at risk and who have NOT trained today
 * (BRT). The decision itself lives in `utils/cron/streakRisk` (pure +
 * tested); this route only gathers the data it needs.
 *
 * Meta semanal manda no alerta
 * ────────────────────────────
 * Até jul/2026 o único critério era "≥3 dias de calendário consecutivos",
 * então quem treina 5x/semana levava o push no PRÓPRIO dia de descanso
 * planejado. Agora, quando o usuário declarou
 * `preferences.trainingFrequencyPerWeek`, a meta é a fonte de verdade.
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

    // Frequência semanal declarada por cada usuário com histórico recente.
    const candidateIds = Array.from(datesByUser.keys())
    const targetByUser = new Map<string, number | null>()
    if (candidateIds.length) {
      const { data: settingsRows } = await admin
        .from('user_settings')
        .select('user_id, preferences')
        .in('user_id', candidateIds)
      for (const row of Array.isArray(settingsRows) ? settingsRows : []) {
        const uid = String((row as { user_id?: string })?.user_id || '').trim()
        if (!uid) continue
        const prefs = (row as { preferences?: unknown })?.preferences
        const target =
          prefs && typeof prefs === 'object'
            ? Number((prefs as Record<string, unknown>).trainingFrequencyPerWeek)
            : NaN
        targetByUser.set(uid, Number.isFinite(target) ? target : null)
      }
    }

    const atRisk: string[] = []
    datesByUser.forEach((trainedDates, uid) => {
      if (shouldNotifyStreakAtRisk({ trainedDates, todayKey, weeklyTarget: targetByUser.get(uid) ?? null })) {
        atRisk.push(uid)
      }
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
