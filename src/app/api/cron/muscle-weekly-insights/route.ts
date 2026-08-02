/**
 * Cron semanal — Mapa Muscular. Roda domingo à noite. Para cada VIP que treinou
 * na semana (já tem resumo cacheado em muscle_weekly_summaries), gera os
 * INSIGHTS DA IA automaticamente, atualiza o cache, e envia um push de resumo.
 *
 * Substitui o botão manual "Gerar com IA" do card por geração automática.
 * Reusa os volumes JÁ calculados no cache (não recomputa nada) — só a camada
 * de insights + o push.
 */
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { env } from '@/utils/env'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { startOfWeekUtc, isoDate } from '@/utils/ai/muscleMapWeekHelpers'
import { generateWeeklyMuscleInsights } from '@/lib/ai/weeklyMuscleInsights'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { sendPushToAllPlatforms } from '@/lib/push/sender'
import { logError, logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Payload = {
  isVip?: boolean
  weekStartDate?: string
  workoutsCount?: number
  muscles?: Record<string, { label?: string; sets?: number }>
  topMuscles?: Array<{ id: string; sets: number; label: string }>
  insights?: unknown
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const apiKey = String(env.gemini.apiKey || '').trim()
  if (!apiKey) return NextResponse.json({ ok: false, error: 'missing_gemini_key' }, { status: 503 })

  try {
    const admin = createAdminClient()
    const weekStartDate = isoDate(startOfWeekUtc(new Date()))

    // Resumos já cacheados desta semana (populados ao terminar treino / abrir o card).
    const { data: rows } = await admin
      .from('muscle_weekly_summaries')
      .select('user_id, payload')
      .eq('week_start_date', weekStartDate)
      .limit(2000)

    const targets = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m.id, { minSets: m.minSets, maxSets: m.maxSets, label: m.label }]))

    let processed = 0
    let pushed = 0
    const notifs: Array<Record<string, unknown>> = []

    for (const row of Array.isArray(rows) ? rows : []) {
      const userId = String((row as { user_id?: string })?.user_id || '').trim()
      const payload = ((row as { payload?: Payload })?.payload || {}) as Payload
      if (!userId || !payload?.isVip) continue
      const workoutsCount = Number(payload?.workoutsCount || 0)
      if (workoutsCount < 1) continue

      const top = Array.isArray(payload?.topMuscles) ? payload.topMuscles : []
      const insightInput = {
        weekStartDate,
        muscles: Object.fromEntries(top.slice(0, 8).map((x) => [x.id, { sets: x.sets, label: x.label }])),
        targets,
        workoutsCount,
      }

      let insights: unknown = null
      try {
        insights = await generateWeeklyMuscleInsights(apiKey, insightInput, 'cron:muscle-weekly-insights')
      } catch (e) {
        logWarn('cron:muscle-weekly-insights', `falha IA p/ ${userId}`, e)
        continue
      }
      if (!insights) continue

      // Atualiza o cache com os insights gerados (mantém o resto do payload).
      await admin
        .from('muscle_weekly_summaries')
        .update({ payload: { ...payload, insights } })
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDate)
      processed += 1

      // Mensagem do push: 1ª linha do resumo da IA, com fallback.
      const summary = insights && typeof insights === 'object' ? (insights as { summary?: unknown }).summary : null
      const firstLine = Array.isArray(summary) && summary.length ? String(summary[0]).slice(0, 110) : ''
      const body = firstLine || `Você treinou ${workoutsCount}x essa semana. Veja seu balanço muscular.`

      try {
        const res = await sendPushToAllPlatforms([userId], 'Resumo da semana 💪', body, { type: 'muscle_weekly_insights', weekStartDate, link: `/dashboard/report/weekly?week=${weekStartDate}` })
        if (res.some((r) => r.ok)) pushed += 1
      } catch (e) { logWarn('cron:muscle-weekly-insights', `push falhou p/ ${userId}`, e) }

      notifs.push({
        user_id: userId,
        recipient_id: userId,
        sender_id: userId,
        type: 'muscle_weekly_insights',
        title: 'Resumo da semana 💪',
        message: body,
        is_read: false,
        // Mesmo deep-link do push: tocar na notificação DENTRO do app também abre o resumo.
        link: `/dashboard/report/weekly?week=${weekStartDate}`,
        metadata: { week_start: weekStartDate, workouts: workoutsCount },
      })
    }

    // skipPush: o push já foi enviado acima por sendPushToAllPlatforms (iOS + Android, com
    // link). O push do insertNotifications é APNs/iOS-only — sem este skip, o usuário de
    // iPhone recebia a MESMA notificação duas vezes (e a 2ª sem o deep-link).
    if (notifs.length) await insertNotifications(notifs, { skipPush: true })
    return NextResponse.json({ ok: true, weekStartDate, processed, pushed })
  } catch (e) {
    logError('cron:muscle-weekly-insights', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
