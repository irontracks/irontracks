import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'

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

const normalizeCoachInboxSettings = (raw: any) => {
  const s = raw && typeof raw === 'object' ? raw : {}
  const toInt = (v: any, min: number, max: number, fallback: number) => {
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
  return `Oi ${name}! Tudo certo por aí?`
}

export async function GET(req: Request) {
  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  try {
    const url = new URL(req.url)
    const limit = clampNumber(Number(url.searchParams.get('limit') || 50), 1, 200)
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
      if (prefs) cfg = normalizeCoachInboxSettings((prefs as any)?.coachInbox)
    } catch {}

    const { data: students, error: stErr } = await admin
      .from('students')
      .select('user_id, name')
      .eq('teacher_id', requesterId)
      .limit(1000)
    if (stErr) return jsonError(400, stErr.message)

    const list = Array.isArray(students) ? students : []
    const studentUserIds = list.map((s) => String((s as any)?.user_id || '').trim()).filter(Boolean)
    if (studentUserIds.length === 0) return NextResponse.json({ ok: true, items: [] }, { headers: { 'cache-control': 'no-store, max-age=0' } })

    const studentNameById = new Map<string, string>()
    for (const s of list) {
      const uid = String((s as any)?.user_id || '').trim()
      if (!uid) continue
      const nm = String((s as any)?.name || '').trim()
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
      const uid = String((w as any)?.user_id || '').trim()
      if (!uid) continue
      if (lastWorkoutByUser.has(uid)) continue
      const t = Date.parse(String((w as any)?.date || ''))
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
      const uid = String((w as any)?.user_id || '').trim()
      if (!uid) continue
      const dateMs = Date.parse(String((w as any)?.date || ''))
      if (!Number.isFinite(dateMs)) continue
      const inLast7 = dateMs >= since7.getTime()
      const exs = Array.isArray((w as any)?.exercises) ? (w as any).exercises : []
      let vol = 0
      for (const ex of exs) {
        const sets = Array.isArray(ex?.sets) ? ex.sets : []
        for (const s of sets) {
          if (!s || typeof s !== 'object') continue
          if (s.completed !== true) continue
          const weight = toNumeric((s as any).weight)
          const reps = toNumeric((s as any).reps)
          if (weight <= 0 || reps <= 0) continue
          vol += weight * reps
        }
      }
      if (!Number.isFinite(vol) || vol <= 0) continue
      const prev = volumeByUser.get(uid) || { v7: 0, vPrev7: 0 }
      if (inLast7) volumeByUser.set(uid, { ...prev, v7: prev.v7 + vol })
      else volumeByUser.set(uid, { ...prev, vPrev7: prev.vPrev7 + vol })
    }

    const { data: states, error: stStateErr } = await admin
      .from('coach_inbox_states')
      .select('coach_id, student_user_id, kind, status, snooze_until')
      .eq('coach_id', requesterId)
      .in('student_user_id', studentUserIds)
      .limit(5000)
    if (stStateErr) return jsonError(400, stStateErr.message)

    const stateByKey = new Map<string, { status: string; snoozeUntil: number }>()
    for (const s of Array.isArray(states) ? states : []) {
      const uid = String((s as any)?.student_user_id || '').trim()
      const kind = String((s as any)?.kind || '').trim()
      if (!uid || !kind) continue
      const status = String((s as any)?.status || 'open').trim().toLowerCase()
      const snoozeUntil = Date.parse(String((s as any)?.snooze_until || ''))
      stateByKey.set(`${uid}:${kind}`, { status, snoozeUntil: Number.isFinite(snoozeUntil) ? snoozeUntil : 0 })
    }

    const items: any[] = []
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
    const sliced = items.slice(0, limit)

    return NextResponse.json({ ok: true, items: sliced }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e))
  }
}
