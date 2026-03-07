import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

const clampNumber = (n: number, min: number, max: number) => {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

const COACH_INBOX_DEFAULTS = {
  churnDays: 7,
  volumeDropPct: 30,
  loadSpikePct: 60,
  minPrev7Volume: 500,
  minCurrent7VolumeSpike: 800,
}

const toNumeric = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim().replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

interface CoachInboxConfig {
  churnDays: number
  volumeDropPct: number
  loadSpikePct: number
  minPrev7Volume: number
  minCurrent7VolumeSpike: number
  [key: string]: unknown
}

const normalizeCoachInboxSettings = (raw: unknown): CoachInboxConfig => {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const toInt = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(v)
    if (!Number.isFinite(n)) return fallback
    const x = Math.floor(n)
    return Math.max(min, Math.min(max, x))
  }

  return {
    churnDays: toInt(s?.churnDays, 1, 60, COACH_INBOX_DEFAULTS.churnDays),
    volumeDropPct: toInt(s?.volumeDropPct, 5, 90, COACH_INBOX_DEFAULTS.volumeDropPct),
    loadSpikePct: toInt(s?.loadSpikePct, 10, 300, COACH_INBOX_DEFAULTS.loadSpikePct),
    minPrev7Volume: toInt(s?.minPrev7Volume, 0, 1000000, COACH_INBOX_DEFAULTS.minPrev7Volume),
    minCurrent7VolumeSpike: toInt(s?.minCurrent7VolumeSpike, 0, 1000000, COACH_INBOX_DEFAULTS.minCurrent7VolumeSpike),
  }
}

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
})

const messageTemplate = (kind: string, studentName: string) => {
  const name = String(studentName || '').trim() || 'você'
  if (kind === 'churn_risk') {
    return `Oi ${name}! Notei que você ficou alguns dias sem treinar. Está tudo certo? Quer que eu ajuste algo no treino pra facilitar sua rotina essa semana?`
  }
  if (kind === 'volume_drop') {
    return `Oi ${name}! Notei uma queda no seu volume de treino nos últimos dias. Como você está se sentindo (sono, energia, dores)? Posso ajustar o plano pra ficar mais sustentável.`
  }
  if (kind === 'load_spike') {
    return `Oi ${name}! Vi um aumento grande de carga/volume recentemente. Só confirmando: está tudo ok (técnica, dores, recuperação)? Se quiser, ajusto pra manter a evolução com segurança.`
  }
  if (kind === 'checkins_alert') {
    return `Oi ${name}! Vi alguns sinais no seu check-in (energia/dor/recuperação). Está tudo certo? Quer que eu ajuste o treino pra ficar mais confortável e sustentável?`
  }
  return `Oi ${name}! Tudo certo por aí?`
}

export async function GET(req: Request) {
  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  try {
    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const limit = clampNumber(q?.limit ?? 30, 1, 100)
    const now = new Date()
    const since7 = new Date(now.getTime() - 7 * DAY_MS)
    const since14 = new Date(now.getTime() - 14 * DAY_MS)

    const requesterId = String(auth.user.id)
    const admin = createAdminClient()
    let cfg = { ...COACH_INBOX_DEFAULTS }
    try {
      const { data: prefRow } = await admin
        .from('user_settings')
        .select('preferences')
        .eq('user_id', requesterId)
        .maybeSingle()
      const prefs = prefRow?.preferences && typeof prefRow.preferences === 'object' ? prefRow.preferences : null
      if (prefs) {
        const prefsObj = prefs as Record<string, unknown>
        cfg = normalizeCoachInboxSettings(prefsObj?.coachInbox)
      }
    } catch {}

    const { data: students, error: stErr } = await admin
      .from('students')
      .select('user_id, name')
      .eq('teacher_id', requesterId)
      .limit(1000)
    if (stErr) return jsonError(400, stErr.message)

    const list = Array.isArray(students) ? students : []
    const studentUserIds = list.map((s) => String((s as Record<string, unknown>)?.user_id ?? '').trim()).filter(Boolean)
    if (studentUserIds.length === 0) return NextResponse.json({ ok: true, items: [] }, { headers: { 'cache-control': 'no-store, max-age=0' } })

    const studentNameById = new Map<string, string>()
    for (const s of list) {
      const uid = String((s as Record<string, unknown>)?.user_id ?? '').trim()
      if (!uid) continue
      const nm = String((s as Record<string, unknown>)?.name ?? '').trim()
      if (nm) studentNameById.set(uid, nm)
    }

    const { data: lastWorkouts, error: lwErr } = await admin
      .from('workouts')
      .select('user_id, date')
      .in('user_id', studentUserIds)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(5000)
    if (lwErr) return jsonError(400, lwErr.message)

    const lastWorkoutByUser = new Map<string, number>()
    for (const w of Array.isArray(lastWorkouts) ? lastWorkouts : []) {
      const uid = String((w as Record<string, unknown>)?.user_id ?? '').trim()
      if (!uid) continue
      if (lastWorkoutByUser.has(uid)) continue
      const t = Date.parse(String((w as Record<string, unknown>)?.date ?? ''))
      if (Number.isFinite(t)) lastWorkoutByUser.set(uid, t)
    }

    const volumeByUser = new Map<string, { v7: number; vPrev7: number }>()
    const { data: workouts14, error: w14Err } = await admin
      .from('workouts')
      .select('id, user_id, date, exercises(id, sets(weight, reps, completed))')
      .in('user_id', studentUserIds)
      .eq('is_template', false)
      .gte('date', since14.toISOString())
      .order('date', { ascending: false })
      .limit(5000)
    if (w14Err) return jsonError(400, w14Err.message)

    for (const w of Array.isArray(workouts14) ? workouts14 : []) {
      const uid = String((w as Record<string, unknown>)?.user_id ?? '').trim()
      if (!uid) continue
      const dateMs = Date.parse(String((w as Record<string, unknown>)?.date ?? ''))
      if (!Number.isFinite(dateMs)) continue
      const inLast7 = dateMs >= since7.getTime()
      const wObj = w as Record<string, unknown>
      const exs = Array.isArray(wObj?.exercises) ? (wObj.exercises as unknown[]) : []
      let vol = 0
      for (const ex of exs) {
        const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
        const sets = Array.isArray(exObj?.sets) ? (exObj.sets as unknown[]) : []
        for (const s of sets) {
          if (!s || typeof s !== 'object') continue
          const sObj = s as Record<string, unknown>
          if (sObj.completed !== true) continue
          const weight = toNumeric(sObj.weight)
          const reps = toNumeric(sObj.reps)
          if (weight <= 0 || reps <= 0) continue
          vol += weight * reps
        }
      }
      if (!Number.isFinite(vol) || vol <= 0) continue
      const prev = volumeByUser.get(uid) || { v7: 0, vPrev7: 0 }
      if (inLast7) volumeByUser.set(uid, { ...prev, v7: prev.v7 + vol })
      else volumeByUser.set(uid, { ...prev, vPrev7: prev.vPrev7 + vol })
    }

    const checkinsAggByUser = new Map<
      string,
      { preEnergySum: number; preEnergyCount: number; preSorenessSum: number; preSorenessCount: number; preLowEnergyCount: number; postSatisfactionSum: number; postSatisfactionCount: number; postRpeSum: number; postRpeCount: number; highSorenessCount: number }
    >()
    try {
      const { data: checkins7, error: cErr } = await admin
        .from('workout_checkins')
        .select('user_id, kind, energy, mood, soreness, answers, created_at')
        .in('user_id', studentUserIds)
        .gte('created_at', since7.toISOString())
        .order('created_at', { ascending: false })
        .limit(20000)
      if (cErr) throw cErr
      for (const r of Array.isArray(checkins7) ? checkins7 : []) {
        const uid = String((r as Record<string, unknown>)?.user_id ?? '').trim()
        if (!uid) continue
        const kind = String((r as Record<string, unknown>)?.kind ?? '').trim()
        const prev = checkinsAggByUser.get(uid) || {
          preEnergySum: 0,
          preEnergyCount: 0,
          preSorenessSum: 0,
          preSorenessCount: 0,
          preLowEnergyCount: 0,
          postSatisfactionSum: 0,
          postSatisfactionCount: 0,
          postRpeSum: 0,
          postRpeCount: 0,
          highSorenessCount: 0,
        }

        const soreness = toNumeric((r as Record<string, unknown>)?.soreness)
        if (Number.isFinite(soreness) && soreness >= 7) prev.highSorenessCount += 1

        if (kind === 'pre') {
          const energy = toNumeric((r as Record<string, unknown>)?.energy)
          if (Number.isFinite(energy) && energy > 0) {
            prev.preEnergySum += energy
            prev.preEnergyCount += 1
            if (energy <= 2) prev.preLowEnergyCount += 1
          }
          if (Number.isFinite(soreness) && soreness >= 0) {
            prev.preSorenessSum += soreness
            prev.preSorenessCount += 1
          }
        }

        if (kind === 'post') {
          const satisfaction = toNumeric((r as Record<string, unknown>)?.mood)
          if (Number.isFinite(satisfaction) && satisfaction > 0) {
            prev.postSatisfactionSum += satisfaction
            prev.postSatisfactionCount += 1
          }
          const answers = (r as Record<string, unknown>)?.answers && typeof (r as Record<string, unknown>).answers === 'object' ? (r as Record<string, unknown>).answers : {}
          const rpe = toNumeric((answers as Record<string, unknown>)?.rpe)
          if (Number.isFinite(rpe) && rpe > 0) {
            prev.postRpeSum += rpe
            prev.postRpeCount += 1
          }
        }

        checkinsAggByUser.set(uid, prev)
      }
    } catch {}

    const { data: states, error: stStateErr } = await admin
      .from('coach_inbox_states')
      .select('coach_id, student_user_id, kind, status, snooze_until')
      .eq('coach_id', requesterId)
      .in('student_user_id', studentUserIds)
      .limit(5000)
    if (stStateErr) return jsonError(400, stStateErr.message)

    const stateByKey = new Map<string, { status: string; snoozeUntil: number }>()
    for (const s of Array.isArray(states) ? states : []) {
      const uid = String((s as Record<string, unknown>)?.student_user_id ?? '').trim()
      const kind = String((s as Record<string, unknown>)?.kind ?? '').trim()
      if (!uid || !kind) continue
      const status = String((s as Record<string, unknown>)?.status ?? 'open').trim().toLowerCase()
      const snoozeUntil = Date.parse(String((s as Record<string, unknown>)?.snooze_until ?? ''))
      stateByKey.set(`${uid}:${kind}`, { status, snoozeUntil: Number.isFinite(snoozeUntil) ? snoozeUntil : 0 })
    }

    const items: Array<{
      id: string
      student_user_id: string
      student_name: string
      kind: string
      title: string
      reason: string
      score: number
      suggested_message: string
      last_workout_at: string | null
    }> = []
    for (const uid of studentUserIds) {
      const name = studentNameById.get(uid) || ''
      const lastAt = lastWorkoutByUser.get(uid) || 0
      const daysSince = lastAt ? Math.floor((now.getTime() - lastAt) / DAY_MS) : 999

      const v = volumeByUser.get(uid) || { v7: 0, vPrev7: 0 }
      const dropRatio = v.vPrev7 > 0 ? (v.v7 / v.vPrev7) : 1
      const incRatio = v.vPrev7 > 0 ? (v.v7 / v.vPrev7) : 1

      const candidates: Array<{ kind: string; title: string; reason: string; score: number }> = []

      if (daysSince >= cfg.churnDays) {
        const score = clampNumber(daysSince * 10, 0, 1000)
        candidates.push({
          kind: 'churn_risk',
          title: 'Risco de churn',
          reason: lastAt ? `${daysSince} dias sem treinar` : 'Sem treinos registrados',
          score,
        })
      }

      const dropThreshold = 1 - cfg.volumeDropPct / 100
      if (v.vPrev7 >= cfg.minPrev7Volume && dropRatio <= dropThreshold) {
        const pct = clampNumber(Math.round((1 - dropRatio) * 100), 0, 1000)
        candidates.push({
          kind: 'volume_drop',
          title: 'Queda de volume',
          reason: `Volume 7d caiu ${pct}% (de ${Math.round(v.vPrev7)} → ${Math.round(v.v7)})`,
          score: 500 + pct,
        })
      }

      const spikeThreshold = 1 + cfg.loadSpikePct / 100
      if (v.vPrev7 >= cfg.minPrev7Volume && incRatio >= spikeThreshold && v.v7 >= cfg.minCurrent7VolumeSpike) {
        const pct = clampNumber(Math.round((incRatio - 1) * 100), 0, 1000)
        candidates.push({
          kind: 'load_spike',
          title: 'Aumento brusco de carga',
          reason: `Volume 7d subiu ${pct}% (de ${Math.round(v.vPrev7)} → ${Math.round(v.v7)})`,
          score: 600 + pct,
        })
      }

      const ca = checkinsAggByUser.get(uid) || null
      if (ca) {
        const preAvgEnergy = ca.preEnergyCount > 0 ? ca.preEnergySum / ca.preEnergyCount : 0
        const preAvgSoreness = ca.preSorenessCount > 0 ? ca.preSorenessSum / ca.preSorenessCount : 0
        const postAvgSatisfaction = ca.postSatisfactionCount > 0 ? ca.postSatisfactionSum / ca.postSatisfactionCount : 0
        const reasons: string[] = []
        let score = 0
        if (ca.highSorenessCount >= 3) {
          reasons.push(`Dor alta (≥ 7) ${ca.highSorenessCount}x nos últimos 7 dias`)
          score += 300 + ca.highSorenessCount * 30
        } else if (preAvgSoreness >= 7) {
          reasons.push(`Média de dor no pré alta (${preAvgSoreness.toFixed(1)})`)
          score += 260
        }
        if (ca.preLowEnergyCount >= 3) {
          reasons.push(`Energia baixa (≤ 2) ${ca.preLowEnergyCount}x`)
          score += 220 + ca.preLowEnergyCount * 20
        } else if (preAvgEnergy > 0 && preAvgEnergy <= 2.2) {
          reasons.push(`Energia média baixa (${preAvgEnergy.toFixed(1)})`)
          score += 160
        }
        if (postAvgSatisfaction > 0 && postAvgSatisfaction <= 2) {
          reasons.push(`Satisfação média baixa (${postAvgSatisfaction.toFixed(1)})`)
          score += 180
        }
        if (reasons.length) {
          candidates.push({
            kind: 'checkins_alert',
            title: 'Alerta de check-in',
            reason: reasons.join(' • '),
            score: 650 + score,
          })
        }
      }

      for (const c of candidates) {
        const state = stateByKey.get(`${uid}:${c.kind}`) || null
        if (state?.status === 'done') continue
        if (state?.status === 'snoozed' && state?.snoozeUntil && state.snoozeUntil > now.getTime()) continue
        items.push({
          id: `${uid}:${c.kind}`,
          student_user_id: uid,
          student_name: name,
          kind: c.kind,
          title: c.title,
          reason: c.reason,
          score: c.score,
          suggested_message: messageTemplate(c.kind, name),
          last_workout_at: lastAt ? new Date(lastAt).toISOString() : null,
        })
      }
    }

    items.sort((a, b) => (b.score || 0) - (a.score || 0))
    const sliced = items.slice(q?.offset ?? 0, (q?.offset ?? 0) + limit)

    return NextResponse.json({ ok: true, items: sliced }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return jsonError(500, msg)
  }
}
