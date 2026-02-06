import { createClient } from '@/utils/supabase/client'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'

const safeString = (v) => {
  const s = String(v ?? '').trim()
  return s
}

const safeIso = (v) => {
  try {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(v)
    const t = d.getTime()
    return Number.isFinite(t) ? d.toISOString() : null
  } catch {
    return null
  }
}

const safeJsonParse = (raw) => {
  try {
    if (!raw) return null
    if (typeof raw === 'object') return raw
    const s = String(raw).trim()
    if (!s) return null
    return JSON.parse(s)
  } catch {
    return null
  }
}

const buildExercisesPayload = (workout) => {
  const w = workout && typeof workout === 'object' ? workout : {}
  const exercises = Array.isArray(w.exercises) ? w.exercises : []
  return exercises
    .filter((ex) => ex && typeof ex === 'object')
    .map((ex, idx) => {
      const setDetails =
        Array.isArray(ex.setDetails) ? ex.setDetails : Array.isArray(ex.set_details) ? ex.set_details : Array.isArray(ex.sets) ? ex.sets : null
      const headerSets = Number.parseInt(String(ex.sets ?? ''), 10) || 0
      const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
      const sets = []
      for (let i = 0; i < numSets; i += 1) {
        const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null
        sets.push({
          weight: s?.weight ?? null,
          reps: s?.reps ?? ex?.reps ?? null,
          rpe: s?.rpe ?? ex?.rpe ?? null,
          set_number: s?.set_number ?? s?.setNumber ?? i + 1,
          completed: false,
          is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
          advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
        })
      }
      return {
        name: safeString(ex?.name || ''),
        notes: safeString(ex?.notes || ''),
        video_url: ex?.videoUrl ?? ex?.video_url ?? null,
        rest_time: ex?.restTime ?? ex?.rest_time ?? null,
        cadence: ex?.cadence ?? null,
        method: ex?.method ?? null,
        order: idx,
        sets,
      }
    })
}

export async function createWorkout(workout) {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: 'unauthorized' }

    const title = safeString(workout?.title ?? workout?.name ?? 'Treino')
    const exercisesPayload = buildExercisesPayload(workout)
    const notes = workout?.notes != null ? safeString(workout.notes) : ''

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
    return { ok: true, id: workoutId }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function updateWorkout(id, workout) {
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
    return { ok: true, id: savedId || workoutId }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function deleteWorkout(id) {
  try {
    const supabase = createClient()
    const workoutId = safeString(id)
    if (!workoutId) return { ok: false, error: 'missing id' }
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function setWorkoutArchived(id, archived = true) {
  try {
    const supabase = createClient()
    const workoutId = safeString(id)
    if (!workoutId) return { ok: false, error: 'missing id' }
    const archivedAt = archived ? new Date().toISOString() : null
    const { error } = await supabase.from('workouts').update({ archived_at: archivedAt }).eq('id', workoutId)
    if (error) return { ok: false, error: error.message }
    return { ok: true, archivedAt }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function setWorkoutSortOrder(id, sortOrder) {
  try {
    const supabase = createClient()
    const workoutId = safeString(id)
    if (!workoutId) return { ok: false, error: 'missing id' }
    const n = Number(sortOrder)
    if (!Number.isFinite(n)) return { ok: false, error: 'invalid sort order' }
    const { error } = await supabase.from('workouts').update({ sort_order: Math.floor(n) }).eq('id', workoutId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function importData(payload) {
  const src = payload && typeof payload === 'object' ? payload : null
  const workouts = Array.isArray(src?.workouts) ? src.workouts : []
  if (!workouts.length) return { ok: true, created: 0 }

  let created = 0
  for (const w of workouts) {
    const res = await createWorkout({
      title: w?.title ?? w?.name ?? 'Treino',
      notes: w?.notes ?? '',
      exercises: Array.isArray(w?.exercises) ? w.exercises : [],
    })
    if (res?.ok) created += 1
  }
  return { ok: true, created }
}

export async function generatePostWorkoutInsights(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/post-workout-insights', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar insights' }
    return json
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function generateExerciseMuscleMap(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/exercise-muscle-map', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao mapear exercícios' }
    return json
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function getMuscleMapWeek(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/muscle-map-week', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar mapa muscular' }
    return json
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function getMuscleMapDay(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/muscle-map-day', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao gerar mapa muscular do dia' }
    return json
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function backfillExerciseMuscleMaps(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/exercise-muscle-map-backfill', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao reprocessar histórico' }
    return json
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function applyProgressionToNextTemplate(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const res = await fetch('/api/ai/apply-progression-next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'Falha ao aplicar progressão' }
    return json
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
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
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

const normalizeExerciseKey = (v) => {
  return safeString(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const extractLogsStatsByExercise = (session) => {
  try {
    const s = session && typeof session === 'object' ? session : {}
    const logs = s?.logs && typeof s.logs === 'object' ? s.logs : {}
    const exercises = Array.isArray(s?.exercises) ? s.exercises : []
    const byKey = new Map()

    Object.entries(logs).forEach(([k, v]) => {
      const log = v && typeof v === 'object' ? v : null
      if (!log) return
      const doneRaw = log?.done ?? log?.isDone ?? log?.completed ?? null
      const done = doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
      if (!done) return
      const parts = String(k || '').split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) return
      const exName = safeString(exercises?.[exIdx]?.name || '')
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

export async function getLatestWorkoutPrs() {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return { ok: false, error: 'unauthorized', prs: [], workout: null }

    const { data: latest, error: lErr } = await supabase
      .from('workouts')
      .select('id, name, date, created_at, notes')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lErr) return { ok: false, error: lErr.message, prs: [], workout: null }
    if (!latest?.id) return { ok: true, prs: [], workout: { title: null, date: null } }

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

    const prevBest = new Map()
    for (const row of Array.isArray(prevRows) ? prevRows : []) {
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

    const prs = []
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

    prs.sort((a, b) => (b.volume || 0) - (a.volume || 0))

    return {
      ok: true,
      prs: prs.slice(0, 12),
      workout: {
        id: String(latest.id),
        title: latest?.name ?? null,
        date: safeIso(latest?.date) || safeIso(latest?.created_at),
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e), prs: [], workout: null }
  }
}

export async function computeWorkoutStreakAndStats() {
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

    const isDayKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim())
    const fmtDay = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' })
    const toDayKey = (v) => {
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
        const d = v instanceof Date ? v : new Date(v)
        if (!Number.isFinite(d.getTime())) return null
        return fmtDay.format(d)
      } catch {
        return null
      }
    }

    const daySet = new Set()
    for (const r of Array.isArray(recentRaw) ? recentRaw : []) {
      const dayKey = toDayKey(r?.date) || toDayKey(r?.created_at)
      if (!dayKey) continue
      daySet.add(dayKey)
    }
    const days = Array.from(daySet.values()).sort()

    const toDayMs = (day) => {
      const t = new Date(`${day}T00:00:00.000Z`).getTime()
      return Number.isFinite(t) ? t : null
    }

    let currentStreak = 0
    let bestStreak = 0

    const todayKey = toDayKey(new Date())
    const hasToday = daySet.has(todayKey)
    const startKey = hasToday ? todayKey : toDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000))
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
    } catch {}

    const badges = []
    if (totalWorkouts > 0) badges.push({ id: 'first_workout', label: 'Primeiro treino', kind: 'milestone' })
    if (currentStreak >= 3) badges.push({ id: 'streak_3', label: '3 dias seguidos', kind: 'streak' })
    if (currentStreak >= 7) badges.push({ id: 'streak_7', label: '7 dias seguidos', kind: 'streak' })
    if (totalVolumeKg >= 5000) badges.push({ id: 'vol_5k', label: '5.000kg levantados', kind: 'volume' })
    if (totalVolumeKg >= 20000) badges.push({ id: 'vol_20k', label: '20.000kg levantados', kind: 'volume' })

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
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function generatePeriodReportInsights(input) {
  try {
    const body = input && typeof input === 'object' ? input : {}
    const type = safeString(body?.type)
    const stats = body?.stats && typeof body.stats === 'object' ? body.stats : null
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

    const ai = {
      title: `Resumo ${label}`,
      summary: [
        `${count} treino(s) finalizado(s)`,
        `${totalMinutes} min no total (${avgMinutes} min/treino)`,
        `${totalVolumeKg.toLocaleString('pt-BR')}kg de volume (${avgVolumeKg.toLocaleString('pt-BR')}kg/treino)`,
      ],
      highlights: topByVolume.map((x) => `${safeString(x?.name) || 'Exercício'}: ${Number(x?.volumeKg || 0).toLocaleString('pt-BR')}kg`),
      focus: [
        uniqueDaysCount ? `Consistência: ${uniqueDaysCount} dia(s) treinados ${cadenceLabel}.` : '',
        topFreqName ? `Exercício mais frequente: ${topFreqName}.` : '',
      ].filter(Boolean),
      nextSteps: [
        count <= 1 ? `Meta rápida: faça 2–3 treinos ${cadenceLabel} para retomar consistência.` : '',
        topVolumeName ? `Progressão: tente +1 rep ou +2,5kg no ${topVolumeName} na próxima sessão.` : '',
        avgMinutes && avgMinutes < 35 ? 'Duração curta: priorize básicos e reduza trocas de exercício.' : '',
      ].filter(Boolean),
      warnings: [],
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
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}

export async function generateAssessmentPlanAi(input) {
  const payload = input && typeof input === 'object' ? input : {}
  const assessment = payload?.assessment && typeof payload.assessment === 'object' ? payload.assessment : null
  if (!assessment) return { ok: false, error: 'missing assessment' }

  const studentName = safeString(payload?.studentName || 'Aluno')
  const goal = safeString(payload?.goal || '')
  const weight = assessment?.weight != null ? safeString(assessment.weight) : ''
  const bf = assessment?.body_fat_percentage != null ? safeString(assessment.body_fat_percentage) : assessment?.bf != null ? safeString(assessment.bf) : ''

  const summary = []
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
    warnings: [],
  }

  return { ok: true, plan, usedAi: false, reason: 'fallback' }
}
