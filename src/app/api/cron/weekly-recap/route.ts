import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'
import { countsAsWorkout } from '@/lib/workout/countsAsWorkout'
import { previousWeekRangeBrt } from '@/utils/cron/weekRangeBrt'

export const dynamic = 'force-dynamic'

/**
 * Weekly cron — fires Monday at 11:00 UTC (08:00 BRT). For each user with
 * at least one workout in the previous ISO week (Mon-Sun), sends a recap
 * push with the workout count.
 *
 * ⚠️ Este é o push do print de 24/08/2026 ("Você fez 7 treinos na semana
 * passada") — o do 📊, não o do 💪 (`muscle-weekly-insights`). Ele somava
 * LINHAS de `workouts`, sem olhar o que havia dentro: as duas linhas a mais do
 * dono eram uma sessão de 62 s com 1 série e outra de 11 min com 1 série.
 * Hoje o critério é `countsAsWorkout` (fonte única), e a semana é BRT.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const { startIso, endIso, startDay, endDay } = previousWeekRangeBrt(new Date())

    // `notes` é necessário para saber se a sessão é um treino de verdade — e
    // aqui isso é aceitável: medido em 24/08/2026, uma semana inteira de TODOS
    // os usuários são 27 linhas / 378 KB, uma vez por semana, num cron. A regra
    // de "nunca selecionar notes" vale para as rotas quentes do app (histórico,
    // bootstrap), que servem isso a cada abertura.
    const { data: rows } = await admin
      .from('workouts')
      .select('user_id, notes')
      .eq('is_template', false)
      .not('completed_at', 'is', null)
      .gte('date', startIso)
      .lt('date', endIso)
      .limit(50000)

    const countByUser = new Map<string, number>()
    for (const r of Array.isArray(rows) ? rows : []) {
      const uid = String((r as { user_id?: string })?.user_id || '').trim()
      if (!uid) continue
      if (!countsAsWorkout((r as { notes?: unknown })?.notes)) continue
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
        metadata: { workouts: count, week_start: startDay, week_end: endDay },
      })
    })

    await insertNotifications(notifs)
    return NextResponse.json({ ok: true, sent: notifs.length })
  } catch (e) {
    logError('cron:weekly-recap', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
