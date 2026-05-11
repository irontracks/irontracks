import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { getActivelyTrainingUsers } from '@/utils/cron/activeSessionFilter'
import { brtDateKey, brtDateKeyDaysAgo } from '@/utils/cron/dateBrt'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * Daily cron — fires at 12:00 UTC (09:00 BRT). Notifies users who have not
 * trained in 3-7 days. The 7-day cap avoids spamming users who churned long
 * ago.
 * Users with an active workout session are skipped — they're already training.
 *
 * Timezone correctness
 * ────────────────────
 * Buckets workouts.date pelo dia BRT (não UTC) pra alinhar com o
 * conceito de "ontem / 3 dias atrás" que o usuário tem. Padronizado
 * junto com o resto dos crons depois do fix do streak-at-risk.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const todayKey = brtDateKey()
    // Over-fetch por uma janela de 8 dias UTC — cobre toda a janela
    // BRT de 7 dias com margem de borda.
    const sinceIso = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const threeAgoKey = brtDateKeyDaysAgo(3)

    const [workoutRows, activeUsers] = await Promise.all([
      admin
        .from('workouts')
        .select('user_id, date')
        .eq('is_template', false)
        .gte('date', sinceIso)
        .order('date', { ascending: false })
        .limit(20000),
      getActivelyTrainingUsers(admin),
    ])

    // Pra cada user, qual o dia BRT mais recente em que treinou.
    const lastByUser = new Map<string, string>()
    for (const r of Array.isArray(workoutRows.data) ? workoutRows.data : []) {
      const uid = String((r as { user_id?: string })?.user_id || '').trim()
      const rawDate = (r as { date?: string })?.date
      if (!uid || !rawDate) continue
      const brtKey = brtDateKey(rawDate)
      if (!brtKey) continue
      const existing = lastByUser.get(uid)
      // Como o array vem ordenado DESC, o primeiro já é o mais recente
      // — só pulamos se já tem entrada.
      if (!existing) lastByUser.set(uid, brtKey)
    }

    const nudge: Array<{ user_id: string; days: number }> = []
    lastByUser.forEach((lastDateKey, uid) => {
      if (activeUsers.has(uid)) return // already training right now — skip
      if (lastDateKey >= threeAgoKey) return // trained in last 3 BRT days
      // Conta dias contando back pra encontrar lastDateKey no calendário BRT
      let days = 0
      for (let d = 1; d <= 7; d++) {
        if (brtDateKeyDaysAgo(d) === lastDateKey) {
          days = d
          break
        }
      }
      if (days >= 3 && days <= 7) nudge.push({ user_id: uid, days })
    })
    // Suprime warning de variável não usada em cenário futuro
    void todayKey

    if (!nudge.length) return NextResponse.json({ ok: true, sent: 0 })

    await insertNotifications(
      nudge.map((row) => ({
        user_id: row.user_id,
        recipient_id: row.user_id,
        sender_id: row.user_id,
        type: 'inactivity',
        title: 'Faz tempo que não te vejo treinar 💪',
        message: `Já são ${row.days} dias sem treino. Bora retomar hoje?`,
        is_read: false,
        metadata: { days_away: row.days },
      })),
    )
    return NextResponse.json({ ok: true, sent: nudge.length })
  } catch (e) {
    logError('cron:inactivity-nudge', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
