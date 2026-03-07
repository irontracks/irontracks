import { createClient } from '@/utils/supabase/client'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { trackUserEvent } from '@/lib/telemetry/userActivity'
import type { ActionResult } from '@/types/actions'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { cacheDeletePattern } from '@/utils/cache'

const invalidateWorkoutCaches = async (userId: string) => {
  if (!userId) return
  try {
    await Promise.all([
      cacheDeletePattern(`workouts:list:${userId}*`),
      cacheDeletePattern(`workouts:history:${userId}:*`),
      cacheDeletePattern(`dashboard:bootstrap:${userId}`),
    ])
  } catch { }
}

const safeString = (v: unknown): string => {
  const s = String(v ?? '').trim()
  return s
}

const safeIso = (v: unknown): string | null => {
  try {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(v as unknown as string | number | Date)
    const t = d.getTime()
    return Number.isFinite(t) ? d.toISOString() : null
  } catch {
    return null
  }
}

const safeJsonParse = (raw: unknown): unknown => parseJsonWithSchema(raw, z.unknown())

const buildExercisesPayload = (workout: unknown): unknown[] => {
  const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>)
  const exercises = Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []
  return exercises
    .filter((ex) => ex && typeof ex === 'object')
    .map((ex, idx) => {
      const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
      const setDetails =
        Array.isArray(exObj.setDetails)
          ? (exObj.setDetails as unknown[])
          : Array.isArray(exObj.set_details)
            ? (exObj.set_details as unknown[])
            : Array.isArray(exObj.sets)
              ? (exObj.sets as unknown[])
              : null
      const headerSets = Number.parseInt(String(exObj.sets ?? ''), 10) || 0
      const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
      const sets: Array<Record<string, unknown>> = []
      for (let i = 0; i < numSets; i += 1) {
        const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null
        const sObj = s && typeof s === 'object' ? (s as Record<string, unknown>) : ({} as Record<string, unknown>)
        sets.push({
          weight: sObj.weight ?? null,
          reps: (sObj.reps ?? exObj.reps) ?? null,
          rpe: (sObj.rpe ?? exObj.rpe) ?? null,
          set_number: (sObj.set_number ?? sObj.setNumber) ?? (i + 1),
          completed: false,
          is_warmup: !!(sObj.is_warmup ?? sObj.isWarmup),
          advanced_config: (sObj.advanced_config ?? sObj.advancedConfig) ?? null,
        })
      }
      return {
        name: safeString(exObj.name || ''),
        notes: safeString(exObj.notes || ''),
        video_url: (exObj.videoUrl ?? exObj.video_url) ?? null,
        rest_time: (exObj.restTime ?? exObj.rest_time) ?? null,
        cadence: exObj.cadence ?? null,
        method: exObj.method ?? null,
        order: idx,
        sets,
      }
    })
}

export async function createWorkout(workout: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: 'unauthorized' }

    const title = safeString(workout?.title ?? workout?.name ?? 'Treino')
    const exercisesPayload = buildExercisesPayload(workout)
    const notes = workout?.notes != null ? safeString(workout.notes) : ''
    try {
      trackUserEvent('workout_create', { type: 'workout', metadata: { title, exercisesCount: exercisesPayload.length } })
    } catch { }

    const { data: workoutId, error } = await supabase.rpc('save_workout_atomic', {
      p_workout_id: null,
      p_user_id: user.id,
      p_created_by: user.id,
      p_is_template: true,
      p_name: normalizeWorkoutTitle(title),
      p_notes: notes,
      p_exercises: exercisesPayload,
    })
    if (error) return { ok: false, error: error.message }
    if (!workoutId) return { ok: false, error: 'Falha ao criar treino' }
    try {
      trackUserEvent('workout_create_ok', { type: 'workout', metadata: { id: workoutId, title } })
    } catch { }

    await invalidateWorkoutCaches(user.id)

    return { ok: true, data: { id: String(workoutId) } }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    try {
      trackUserEvent('workout_create_error', { type: 'workout', metadata: { message } })
    } catch { }
    return { ok: false, error: message }
  }
}

export async function updateWorkout(id: string, workout: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: 'unauthorized' }

    const workoutId = safeString(id)
    if (!workoutId) return { ok: false, error: 'missing id' }

    const title = safeString(workout?.title ?? workout?.name ?? 'Treino')
    const exercisesPayload = buildExercisesPayload(workout)
    const notes = workout?.notes != null ? safeString(workout.notes) : ''
    try {
      trackUserEvent('workout_update', { type: 'workout', metadata: { id: workoutId, title, exercisesCount: exercisesPayload.length } })
    } catch { }

    const { data: savedId, error } = await supabase.rpc('save_workout_atomic', {
      p_workout_id: workoutId,
      p_user_id: user.id,
      p_created_by: user.id,
      p_is_template: true,
      p_name: normalizeWorkoutTitle(title),
      p_notes: notes,
      p_exercises: exercisesPayload,
    })
    if (error) return { ok: false, error: error.message }
    try {
      trackUserEvent('workout_update_ok', { type: 'workout', metadata: { id: savedId || workoutId, title } })
    } catch { }

    await invalidateWorkoutCaches(user.id)

    return { ok: true, data: { id: String(savedId || workoutId) } }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    try {
      trackUserEvent('workout_update_error', { type: 'workout', metadata: { message } })
    } catch { }
    return { ok: false, error: message }
  }
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const workoutId = safeString(id)
    if (!workoutId) return { ok: false, error: 'missing id' }
    try {
      trackUserEvent('workout_delete', { type: 'workout', metadata: { id: workoutId } })
    } catch { }
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
    if (error) return { ok: false, error: error.message }
    try {
      trackUserEvent('workout_delete_ok', { type: 'workout', metadata: { id: workoutId } })
    } catch { }

    if (user?.id) await invalidateWorkoutCaches(user.id)

    return { ok: true, data: undefined }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    try {
      trackUserEvent('workout_delete_error', { type: 'workout', metadata: { message } })
    } catch { }
    return { ok: false, error: message }
  }
}

export async function setWorkoutArchived(id: string, archived = true): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const workoutId = safeString(id)
    if (!workoutId) return { ok: false, error: 'missing id' }
    const archivedAt = archived ? new Date().toISOString() : null
    const { error } = await supabase.from('workouts').update({ archived_at: archivedAt }).eq('id', workoutId)
    if (error) return { ok: false, error: error.message }
    void archivedAt

    if (user?.id) await invalidateWorkoutCaches(user.id)

    return { ok: true, data: undefined }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function setWorkoutSortOrder(ids: string[]): Promise<ActionResult> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const list = (Array.isArray(ids) ? ids : []).map((x) => safeString(x)).filter(Boolean)
    for (let i = 0; i < list.length; i += 1) {
      const workoutId = list[i]
      const { error } = await supabase.from('workouts').update({ sort_order: i }).eq('id', workoutId)
      if (error) return { ok: false, error: error.message }
    }

    if (user?.id) await invalidateWorkoutCaches(user.id)

    return { ok: true, data: undefined }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function importData(payload: unknown): Promise<ActionResult<{ imported: number }>> {
  const payloadObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  const workouts = Array.isArray(payloadObj?.workouts) ? (payloadObj?.workouts as unknown[]) : []
  if (!workouts.length) return { ok: true, data: { imported: 0 } }

  let created = 0
  for (const w of workouts) {
    const wObj = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
    const res = await createWorkout({
      title: wObj?.title ?? wObj?.name ?? 'Treino',
      notes: wObj?.notes ?? '',
      exercises: Array.isArray(wObj?.exercises) ? (wObj.exercises as unknown[]) : [],
    })
    if (res?.ok) created += 1
  }
  return { ok: true, data: { imported: created } }
}

export async function generatePostWorkoutInsights(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/post-workout-insights', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar insights', upgradeRequired: json?.upgradeRequired } as unknown as ActionResult<Record<string, unknown>>
    return json as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function generateExerciseMuscleMap(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/exercise-muscle-map', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao mapear exercícios' }
    return json as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function getMuscleMapWeek(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/muscle-map-week', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar mapa muscular' }
    return json as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function getMuscleMapDay(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/muscle-map-day', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar mapa muscular do dia' }
    return json as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function backfillExerciseMuscleMaps(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/exercise-muscle-map-backfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao reprocessar histórico' }
    return json as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function applyProgressionToNextTemplate(
  input: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/apply-progression-next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch((): null => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao aplicar progressão' }
    return json as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function getIronRankLeaderboard(limit = 100) {
  try {
    const supabase = createClient()
    const n = Math.min(300, Math.max(1, Number(limit) || 100))
    const { data, error } = await supabase.rpc('iron_rank_leaderboard', { limit_count: n })
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: Array.isArray(data) ? data : [] }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

const normalizeExerciseKey = (v: unknown): string => {
  return safeString(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const extractLogsStatsByExercise = (session: unknown) => {
  try {
    const s = session && typeof session === 'object' ? (session as Record<string, unknown>) : ({} as Record<string, unknown>)
    const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
    const exercises = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
    const byKey = new Map<string, { exercise: string; weight: number; reps: number; volume: number }>()

    Object.entries(logs).forEach(([k, v]) => {
      const log = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
      if (!log) return
      const doneRaw = log?.done ?? log?.isDone ?? log?.completed ?? null
      const done = doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
      if (!done) return
      const parts = String(k || '').split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) return
      const ex = exercises?.[exIdx]
      const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null
      const exName = safeString(exObj?.name || '')
      if (!exName) return
      const key = normalizeExerciseKey(exName)
      if (!key) return
      const wRaw = Number(String(log?.weight ?? '').replace(',', '.'))
      const rRaw = Number(String(log?.reps ?? '').replace(',', '.'))
      const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 0
      const r = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : 0
      if (!w && !r) return
      const volume = w && r ? w * r : 0
      const cur = byKey.get(key) || { exercise: exName, weight: 0, reps: 0, volume: 0 }
      cur.exercise = exName
      cur.weight = Math.max(cur.weight, w)
      cur.reps = Math.max(cur.reps, r)
      cur.volume = Math.max(cur.volume, volume)
      byKey.set(key, cur)
    })

    return byKey
  } catch {
    return new Map()
  }
}

export async function getLatestWorkoutPrs(): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: 'unauthorized', prs: [], workout: null } as unknown as ActionResult<Record<string, unknown>>

    const { data: latest, error: lErr } = await supabase
      .from('workouts')
      .select('id, name, date, created_at, notes')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lErr) return { ok: false, error: lErr.message, prs: [], workout: null } as unknown as ActionResult<Record<string, unknown>>
    if (!latest?.id) return { ok: true, data: { prs: [], workout: { title: null, date: null } }, prs: [], workout: { title: null, date: null } } as unknown as ActionResult<Record<string, unknown>>

    const session = safeJsonParse(latest.notes)
    const currentMap = extractLogsStatsByExercise(session)

    const { data: prevRows } = await supabase
      .from('workouts')
      .select('id, notes, date, created_at')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .neq('id', String(latest.id))
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)

    const prevBest = new Map<string, { weight: number; reps: number; volume: number }>()
    for (const row of Array.isArray(prevRows) ? (prevRows as Array<Record<string, unknown>>) : []) {
      const prevSession = safeJsonParse(row?.notes)
      const m = extractLogsStatsByExercise(prevSession)
      for (const [k, st] of m.entries()) {
        const cur = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
        prevBest.set(k, {
          weight: Math.max(cur.weight, st.weight || 0),
          reps: Math.max(cur.reps, st.reps || 0),
          volume: Math.max(cur.volume, st.volume || 0),
        })
      }
    }

    const prs: Array<Record<string, unknown>> = []
    for (const [k, st] of currentMap.entries()) {
      const base = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
      const improved = {
        weight: (st.weight || 0) > (base.weight || 0),
        reps: (st.reps || 0) > (base.reps || 0),
        volume: (st.volume || 0) > (base.volume || 0),
      }
      if (!improved.weight && !improved.reps && !improved.volume) continue
      prs.push({ ...st, improved })
    }

    prs.sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))

    return {
      ok: true,
      data: {
        prs: prs.slice(0, 12),
        workout: {
          id: String(latest.id),
          title: latest?.name ?? null,
          date: safeIso(latest?.date) || safeIso(latest?.created_at),
        },
      },
      prs: prs.slice(0, 12),
      workout: {
        id: String(latest.id),
        title: latest?.name ?? null,
        date: safeIso(latest?.date) || safeIso(latest?.created_at),
      },
    } as unknown as ActionResult<Record<string, unknown>>
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message, prs: [], workout: null } as unknown as ActionResult<Record<string, unknown>>
  }
}

export async function computeWorkoutStreakAndStats(): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: 'unauthorized' }

    const { data: recentRaw } = await supabase
      .from('workouts')
      .select('id, date, created_at')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(180)

    const isDayKey = (s: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim())
    const fmtDay = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const toDayKey = (v: unknown): string | null => {
      try {
        if (!v) return null
        if (typeof v === 'string') {
          const s = v.trim()
          if (!s) return null
          if (isDayKey(s)) return s
          const d = new Date(s)
          if (!Number.isFinite(d.getTime())) return null
          return fmtDay.format(d)
        }
        const d =
          v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : new Date(String(v))
        if (!Number.isFinite(d.getTime())) return null
        return fmtDay.format(d)
      } catch {
        return null
      }
    }

    const daySet = new Set<string>()
    for (const r of Array.isArray(recentRaw) ? recentRaw : []) {
      const dayKey = toDayKey(r?.date) || toDayKey(r?.created_at)
      if (!dayKey) continue
      daySet.add(dayKey)
    }
    const days = Array.from(daySet.values()).sort()

    const toDayMs = (day: unknown): number | null => {
      const t = new Date(`${day}T00:00:00.000Z`).getTime()
      return Number.isFinite(t) ? t : null
    }

    let currentStreak = 0
    let bestStreak = 0

    const todayKey = toDayKey(new Date()) || ''
    const hasToday = daySet.has(todayKey)
    const startKey = hasToday ? todayKey : toDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000)) || ''
    if (daySet.has(startKey)) {
      let cursor = startKey
      while (daySet.has(cursor)) {
        currentStreak += 1
        const ms = toDayMs(cursor)
        if (!ms) break
        cursor = new Date(ms - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      }
    }

    for (let i = 0; i < days.length; i += 1) {
      let streak = 1
      for (let j = i; j > 0; j -= 1) {
        const a = toDayMs(days[j])
        const b = toDayMs(days[j - 1])
        if (a == null || b == null) break
        if (a - b !== 24 * 60 * 60 * 1000) break
        streak += 1
      }
      bestStreak = Math.max(bestStreak, streak)
    }

    const workoutsCountRes = await supabase
      .from('workouts')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', user.id)
      .eq('is_template', false)

    const totalWorkouts = Number(workoutsCountRes.count) || 0

    let totalVolumeKg = 0
    try {
      const { data: vol, error: vErr } = await supabase.rpc('iron_rank_my_total_volume')
      if (!vErr) totalVolumeKg = Math.round(Number(String(vol ?? 0).replace(',', '.')) || 0)
    } catch { }

    const badges: Array<Record<string, unknown>> = []
    if (totalWorkouts > 0) badges.push({ id: 'first_workout', label: 'Primeiro treino', kind: 'milestone' })
    if (currentStreak >= 3) badges.push({ id: 'streak_3', label: '3 dias seguidos', kind: 'streak' })
    if (currentStreak >= 7) badges.push({ id: 'streak_7', label: '7 dias seguidos', kind: 'streak' })
    if (totalVolumeKg >= 5000) badges.push({ id: 'vol_5k', label: '5.000kg levantados', kind: 'volume' })
    if (totalVolumeKg >= 20000) badges.push({ id: 'vol_20k', label: '20.000kg levantados', kind: 'volume' })
    if (totalVolumeKg >= 50000) badges.push({ id: 'vol_50k', label: '50.000kg levantados', kind: 'volume' })
    if (totalVolumeKg >= 100000) badges.push({ id: 'vol_100k', label: '100.000kg levantados', kind: 'volume' })
    if (totalVolumeKg >= 500000) badges.push({ id: 'vol_500k', label: '500.000kg levantados', kind: 'volume' })
    if (totalVolumeKg >= 1000000) badges.push({ id: 'vol_1m', label: '1.000.000kg levantados', kind: 'volume' })

    return {
      ok: true,
      data: {
        currentStreak,
        bestStreak,
        totalWorkouts,
        totalVolumeKg,
        badges,
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}

export async function generatePeriodReportInsights(input: unknown) {
  try {
    const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
    const type = safeString(body?.type)
    const stats: Record<string, unknown> | null = body?.stats && typeof body.stats === 'object' ? (body.stats as Record<string, unknown>) : null
    if (!type || !stats) return { ok: false, error: 'missing input' }

    const count = Number(stats.count) || 0
    const totalMinutes = Number(stats.totalMinutes) || 0
    const avgMinutes = Number(stats.avgMinutes) || 0
    const totalVolumeKg = Number(stats.totalVolumeKg) || 0
    const avgVolumeKg = Number(stats.avgVolumeKg) || 0
    const days = Number(stats.days) || 0
    const uniqueDaysCount = Number(stats?.uniqueDaysCount) || 0

    const label = type === 'week' ? 'semanal' : type === 'month' ? 'mensal' : `de ${days} dias`
    const cadenceLabel = type === 'week' ? 'na semana' : type === 'month' ? 'no mês' : 'no período'

    const topByVolume = (Array.isArray(stats?.topExercisesByVolume) ? stats.topExercisesByVolume : []).slice(0, 3)
    const topByFreq = (Array.isArray(stats?.topExercisesByFrequency) ? stats.topExercisesByFrequency : []).slice(0, 3)
    const topVolumeName = safeString(topByVolume?.[0]?.name)
    const topFreqName = safeString(topByFreq?.[0]?.name)

    // ✅ Attempt real AI endpoint first (graceful fallback if unavailable)
    try {
      const aiRes = await fetch('/api/ai/period-insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, stats }),
      })
      if (aiRes.ok) {
        const aiJson = await aiRes.json().catch((): null => null)
        if (aiJson?.ok && aiJson?.ai && typeof aiJson.ai === 'object') {
          return { ok: true, ai: aiJson.ai }
        }
      }
    } catch { /* silenced — fall through to deterministic */ }

    // Deterministic fallback (always works, offline-friendly)
    const ai = {
      title: `Resumo ${label}`,
      summary: [
        `${count} treino(s) finalizado(s)`,
        `${totalMinutes} min no total (${avgMinutes} min/treino)`,
        `${totalVolumeKg.toLocaleString('pt-BR')}kg de volume (${avgVolumeKg.toLocaleString('pt-BR')}kg/treino)`,
      ],
      highlights: topByVolume.map((x: Record<string, unknown>) => `${safeString(String(x?.name ?? '')) || 'Exercício'}: ${Number(x?.volumeKg ?? 0).toLocaleString('pt-BR')}kg`),
      focus: [
        uniqueDaysCount ? `Consistência: ${uniqueDaysCount} dia(s) treinados ${cadenceLabel}.` : '',
        topFreqName ? `Exercício mais frequente: ${topFreqName}.` : '',
      ].filter(Boolean),
      nextSteps: [
        count <= 1 ? `Meta rápida: faça 2–3 treinos ${cadenceLabel} para retomar consistência.` : '',
        topVolumeName ? `Progressão: tente +1 rep ou +2,5kg no ${topVolumeName} na próxima sessão.` : '',
        avgMinutes && avgMinutes < 35 ? 'Duração curta: priorize básicos e reduza trocas de exercício.' : '',
      ].filter(Boolean),
      warnings: [] as string[],
    }

    if (count === 0) {
      ai.warnings.push('Sem treinos registrados no período. Ajuste a meta para algo realista e comece pequeno.')
    }
    if (avgMinutes >= 95) {
      ai.warnings.push('Sessões longas: considere reduzir volume por treino para manter qualidade e recuperação.')
    }
    if (uniqueDaysCount && count / Math.max(1, uniqueDaysCount) > 2.5) {
      ai.warnings.push('Muitos treinos no mesmo dia: cuide do sono e do descanso entre sessões.')
    }

    return { ok: true, ai }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message }
  }
}


export async function generateAssessmentPlanAi(input: unknown) {
  const payload = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const assessment: Record<string, unknown> | null = payload?.assessment && typeof payload.assessment === 'object' ? (payload.assessment as Record<string, unknown>) : null
  if (!assessment) return { ok: false, error: 'missing assessment' }

  const studentName = safeString(payload?.studentName || 'Aluno')
  const goal = safeString(payload?.goal || '')
  const weight = assessment?.weight != null ? safeString(assessment.weight) : ''
  const bf = assessment?.body_fat_percentage != null ? safeString(assessment.body_fat_percentage) : assessment?.bf != null ? safeString(assessment.bf) : ''

  const summary: string[] = []
  summary.push(`Plano tático (base) para ${studentName}.`)
  if (goal) summary.push(`Objetivo: ${goal}`)
  if (weight) summary.push(`Peso atual: ${weight} kg`)
  if (bf) summary.push(`BF: ${bf}%`)

  const plan = {
    summary,
    training: [
      'Priorize progressão em básicos (agachamento/terra/supino/remo).',
      'Registre cargas e reps; busque +1 rep ou +2,5kg quando possível.',
      'Frequência sugerida: 4–5x/semana (ajuste conforme rotina).',
    ],
    nutrition: ['Proteína alta e consistente; carbo em torno do treino; hidratação.'],
    habits: ['Sono: 7–9h.', 'Passos: 7k–10k/dia (ajuste conforme objetivo).'],
    warnings: [] as string[],
  }

  return { ok: true, plan, usedAi: false, reason: 'fallback' }
}

// ─── Consolidated report previous data (G1+G2 merged) ───────────────────────

interface ReportPreviousParams {
  userId: string
  currentSessionId: string | null
  currentDate: string | null
  currentOriginId: string | null
  currentTitle: string | null
  exerciseNames: string[]
}

interface ReportPreviousResult {
  previousSession: Record<string, unknown> | null
  prevLogsByExercise: Record<string, unknown>
  prevBaseMsByExercise: Record<string, number>
}

const parseNotesField = (notes: unknown): Record<string, unknown> | null => {
  try {
    if (typeof notes === 'string') {
      const trimmed = notes.trim()
      if (!trimmed) return null
      return parseJsonWithSchema(trimmed, z.record(z.unknown()))
    }
    if (notes && typeof notes === 'object') return notes as Record<string, unknown>
    return null
  } catch { return null }
}

const extractDateMs = (v: unknown): number | null => {
  try {
    if (!v) return null
    if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null
    const ms = new Date(v as string | number | Date).getTime()
    return Number.isFinite(ms) ? ms : null
  } catch { return null }
}

const extractLogsByExIdx = (parsed: Record<string, unknown>, exIdx: number): unknown[] => {
  try {
    const logs = parsed?.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, unknown>) : {}
    const out: unknown[] = []
    for (const key of Object.keys(logs)) {
      const parts = key.split('-')
      const eIdx = Number(parts[0])
      const sIdx = Number(parts[1])
      if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx) || eIdx !== exIdx) continue
      out[sIdx] = logs[key]
    }
    return out
  } catch { return [] }
}

const hasComparableLog = (logsArr: unknown[]): boolean => {
  for (const l of logsArr) {
    if (!l || typeof l !== 'object') continue
    const obj = l as Record<string, unknown>
    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
    if ((Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)) return true
  }
  return false
}

export async function getReportPreviousData(params: ReportPreviousParams): Promise<ReportPreviousResult> {
  const empty: ReportPreviousResult = { previousSession: null, prevLogsByExercise: {}, prevBaseMsByExercise: {} }
  try {
    const { userId, currentSessionId, currentDate, currentOriginId, currentTitle, exerciseNames } = params
    if (!userId) return empty
    const supabase = createClient()

    // Single query — 200 rows is enough for both previous session and per-exercise lookup
    let query = supabase.from('workouts').select('id, date, created_at, notes, name')
      .eq('user_id', userId).eq('is_template', false)
      .order('date', { ascending: false }).limit(200)
    if (currentSessionId) query = query.neq('id', currentSessionId)
    const { data: rows, error } = await query
    if (error) return empty
    const candidates = Array.isArray(rows) ? rows : []

    const currentMs = extractDateMs(currentDate)
    const currentOriginIdStr = currentOriginId ? String(currentOriginId) : null
    const currentTitleKey = currentTitle ? String(currentTitle).trim().toLowerCase() : ''

    // Build wanted exercise keys
    const wantedExercises = new Map<string, string>()
    for (const name of exerciseNames) {
      const trimmed = String(name || '').trim()
      if (!trimmed) continue
      const key = normalizeExerciseKey(trimmed)
      if (key && !wantedExercises.has(key)) wantedExercises.set(key, trimmed)
    }
    const remainingExercises = new Set(Array.from(wantedExercises.keys()))

    // Single pass through all candidates
    let bestPreviousSession: Record<string, unknown> | null = null
    let bestPreviousMs = -1
    const resolvedLogs: Record<string, unknown> = {}
    const resolvedBaseMs: Record<string, number> = {}

    for (const r of candidates) {
      if (!r || typeof r !== 'object') continue
      const parsed = parseNotesField((r as Record<string, unknown>).notes)
      if (!parsed) continue
      const candidateMs = extractDateMs(parsed?.date) ?? extractDateMs((r as Record<string, unknown>)?.date) ?? extractDateMs((r as Record<string, unknown>)?.created_at) ?? null
      if (typeof candidateMs !== 'number' || !Number.isFinite(candidateMs)) continue
      if (typeof currentMs === 'number' && Number.isFinite(currentMs) && candidateMs >= currentMs) continue

      // G1: Find best previous session (same workout) — must have real log data
      if (!bestPreviousSession) {
        const candOrigin = parsed?.originWorkoutId ?? parsed?.workoutId ?? null
        const candTitle = String(parsed?.workoutTitle ?? parsed?.name ?? '').trim().toLowerCase()
        const originMatch = !!(currentOriginIdStr && candOrigin && String(candOrigin) === currentOriginIdStr)
        const titleMatch = !!(currentTitleKey && candTitle && currentTitleKey === candTitle)
        if (originMatch || titleMatch) {
          if (candidateMs > bestPreviousMs) {
            // ✅ Only accept if the session actually has logged data (weight or reps > 0)
            // Prevents using a "ghost" session where the user opened but didn't log
            const candLogs = parsed?.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, unknown>) : {}
            const hasRealLogs = Object.values(candLogs).some((v) => {
              if (!v || typeof v !== 'object') return false
              const obj = v as Record<string, unknown>
              const w = Number(String(obj?.weight ?? '').replace(',', '.'))
              const r = Number(String(obj?.reps ?? '').replace(',', '.'))
              return (Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)
            })
            if (hasRealLogs) {
              bestPreviousMs = candidateMs
              bestPreviousSession = { ...parsed, id: parsed?.id ?? (r as Record<string, unknown>)?.id ?? null }
            }
          }
        }
      }

      // G2: Find per-exercise previous logs
      if (remainingExercises.size > 0) {
        const exArr = Array.isArray(parsed?.exercises) ? parsed.exercises as unknown[] : []
        for (let exIdx = 0; exIdx < exArr.length; exIdx++) {
          if (!remainingExercises.size) break
          const ex = exArr[exIdx]
          if (!ex || typeof ex !== 'object') continue
          const exName = String((ex as Record<string, unknown>)?.name || '').trim()
          if (!exName) continue
          const key = normalizeExerciseKey(exName)
          if (!key || !remainingExercises.has(key)) continue
          const logs = extractLogsByExIdx(parsed, exIdx)
          if (!hasComparableLog(logs)) continue
          resolvedLogs[key] = logs
          resolvedBaseMs[key] = candidateMs
          remainingExercises.delete(key)
        }
      }

      // Early exit if we have everything
      if (bestPreviousSession && remainingExercises.size === 0) break
    }

    return {
      previousSession: bestPreviousSession,
      prevLogsByExercise: resolvedLogs,
      prevBaseMsByExercise: resolvedBaseMs,
    }
  } catch {
    return empty
  }
}

// ─── Historical best e1RM per exercise (all-time) ────────────────────────────
// Used to detect TRUE PRs (vs just the previous session).
// Returns: { [normalizedExerciseName]: bestE1rm (kg) }

export async function getHistoricalBestE1rm(params: {
  userId: string
  currentSessionId: string | null
  exerciseNames: string[]
}): Promise<Record<string, number>> {
  const empty: Record<string, number> = {}
  try {
    const { userId, currentSessionId, exerciseNames } = params
    if (!userId || !exerciseNames.length) return empty
    const supabase = createClient()

    // Fetch up to 100 historical sessions (excluding current)
    let query = supabase
      .from('workouts')
      .select('id, notes')
      .eq('user_id', userId)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(100)
    if (currentSessionId) query = query.neq('id', currentSessionId)
    const { data: rows, error } = await query
    if (error || !Array.isArray(rows)) return empty

    // Build normalized key set for wanted exercises
    const normalize = (name: string) =>
      name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

    const wantedKeys = new Set(exerciseNames.map((n) => normalize(String(n || '').trim())).filter(Boolean))
    const bestE1rm: Record<string, number> = {}

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const parsed = parseNotesField((row as Record<string, unknown>).notes)
      if (!parsed) continue
      const exercises = Array.isArray(parsed?.exercises) ? (parsed.exercises as unknown[]) : []
      const logs = parsed?.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, unknown>) : {}

      exercises.forEach((ex, exIdx) => {
        if (!ex || typeof ex !== 'object') return
        const exName = String((ex as Record<string, unknown>)?.name || '').trim()
        if (!exName) return
        const key = normalize(exName)
        if (!wantedKeys.has(key)) return

        // Find best e1RM for this exercise in this session
        Object.entries(logs).forEach(([k, v]) => {
          const parts = k.split('-')
          const eIdx = Number(parts[0])
          if (!Number.isFinite(eIdx) || eIdx !== exIdx) return
          if (!v || typeof v !== 'object') return
          const obj = v as Record<string, unknown>
          const w = Number(String(obj?.weight ?? '').replace(',', '.'))
          const r = Number(String(obj?.reps ?? '').replace(',', '.'))
          if (w <= 0 || r <= 0 || !Number.isFinite(w) || !Number.isFinite(r)) return
          const e1rm = w * (1 + r / 30)
          if (!Number.isFinite(e1rm)) return
          if (!bestE1rm[key] || e1rm > bestE1rm[key]) bestE1rm[key] = e1rm
        })
      })
    }

    return bestE1rm
  } catch {
    return empty
  }
}
