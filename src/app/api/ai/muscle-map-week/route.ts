import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: any) => {
  try {
    if (!raw) return null
    if (typeof raw === 'object') return raw
    const trimmed = String(raw || '').trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

const extractJsonFromModelText = (text: string) => {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

const toStr = (v: any) => String(v || '').trim()

const startOfWeekUtc = (d: Date) => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day
  date.setUTCDate(date.getUTCDate() + diff)
  return date
}

const isoDate = (d: Date) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const addDaysUtc = (d: Date, days: number) => {
  const next = new Date(d.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const parseEffortFactor = (log: any) => {
  const rirRaw = log?.rir ?? log?.RIR
  const rpeRaw = log?.rpe ?? log?.RPE
  const rir = Number(String(rirRaw ?? '').replace(',', '.'))
  if (Number.isFinite(rir)) {
    if (rir <= 1) return 1
    if (rir <= 3) return 0.85
    if (rir <= 4) return 0.7
    return 0.5
  }
  const rpe = Number(String(rpeRaw ?? '').replace(',', '.'))
  if (Number.isFinite(rpe)) {
    if (rpe >= 9) return 1
    if (rpe >= 8) return 0.9
    if (rpe >= 7) return 0.8
    if (rpe >= 6) return 0.7
    return 0.6
  }
  return 1
}

const plannedSetsCount = (exercise: any) => {
  const ex = exercise && typeof exercise === 'object' ? exercise : {}
  const setsArr = Array.isArray(ex?.sets) ? ex.sets : null
  if (setsArr) return setsArr.length
  const n = Number(ex?.sets ?? ex?.setsCount ?? ex?.setCount)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 0
}

const colorForRatio = (ratio: number) => {
  const r = Number.isFinite(ratio) ? ratio : 0
  if (r <= 0.15) return '#0b1220'
  if (r <= 0.35) return '#111827'
  if (r <= 0.6) return '#1f2937'
  if (r <= 0.9) return '#f59e0b'
  if (r <= 1.2) return '#fb923c'
  return '#ef4444'
}

const normalizeAiExerciseMap = (obj: any) => {
  const base = obj && typeof obj === 'object' ? obj : {}
  const itemsRaw = Array.isArray(base.items) ? base.items : []
  const muscleIds = new Set(MUSCLE_GROUPS.map((m) => m.id))

  const items = itemsRaw
    .map((it: any) => {
      const name = toStr(it?.name)
      const canonical =
        toStr(it?.canonical_name || it?.canonicalName || it?.canonical) || (name ? resolveCanonicalExerciseName(name)?.canonical : '')
      const key = normalizeExerciseName(canonical || name)
      if (!key) return null

      const contribRaw = Array.isArray(it?.contributions) ? it.contributions : Array.isArray(it?.muscles) ? it.muscles : []
      const contributions = contribRaw
        .map((c: any) => {
          const muscleId = toStr(c?.muscleId || c?.id)
          if (!muscleId || !muscleIds.has(muscleId as any)) return null
          const weight = Number(c?.weight)
          if (!Number.isFinite(weight) || weight <= 0) return null
          const role = toStr(c?.role || c?.type || 'primary') || 'primary'
          return { muscleId, weight, role }
        })
        .filter(Boolean)

      const weightSum = contributions.reduce((acc: number, c: any) => acc + (Number(c?.weight) || 0), 0)
      const normalizedContrib =
        weightSum > 0
          ? contributions.map((c: any) => ({ ...c, weight: (Number(c.weight) || 0) / weightSum }))
          : []

      const confidenceRaw = Number(it?.confidence)
      const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.6

      return {
        exercise_key: key,
        canonical_name: canonical || name,
        mapping: {
          contributions: normalizedContrib,
          unilateral: Boolean(it?.unilateral),
          confidence,
          notes: toStr(it?.notes).slice(0, 240),
        },
        confidence,
      }
    })
    .filter(Boolean)

  return items
}

const classifyExercisesWithAi = async (apiKey: string, names: string[]) => {
  const muscleList = MUSCLE_GROUPS.map((m) => `${m.id}: ${m.label}`).join(', ')
  const schema = [
    '{',
    '  "items": [',
    '    {',
    '      "name": string,',
    '      "canonical_name": string,',
    '      "contributions": [ { "muscleId": string, "weight": number, "role": "primary"|"secondary"|"stabilizer" } ],',
    '      "unilateral": boolean,',
    '      "confidence": number (0..1),',
    '      "notes": string',
    '    }',
    '  ]',
    '}',
  ].join('\n')

  const prompt = [
    'Você é um coach de musculação do app IronTracks.',
    'Objetivo: mapear exercícios para músculos alvo, para calcular volume semanal por músculo.',
    '',
    'REGRAS ABSOLUTAS:',
    '- Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
    '- Escreva em pt-BR.',
    '- Use SOMENTE os muscleId da lista permitida.',
    '- Distribua pesos (weight) positivos e normalize para somar 1.0 (aproximado).',
    '- Se estiver incerto, use confidence menor.',
    '',
    'MÚSCULOS PERMITIDOS (muscleId: label):',
    muscleList,
    '',
    'Formato (JSON):',
    schema,
    '',
    'Exercícios para mapear (array):',
    JSON.stringify(names),
  ].join('\n')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL })
  const result = await model.generateContent([{ text: prompt }] as any)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJsonFromModelText(text)
  if (!parsed) return []
  return normalizeAiExerciseMap(parsed)
}

const normalizeAiInsights = (obj: any) => {
  const base = obj && typeof obj === 'object' ? obj : {}
  const toArr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const toStrArr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const alertsRaw = Array.isArray(base?.imbalanceAlerts) ? base.imbalanceAlerts : []
  const recsRaw = Array.isArray(base?.recommendations) ? base.recommendations : []
  const imbalanceAlerts = alertsRaw
    .map((a: any) => {
      const type = toStr(a?.type).slice(0, 60)
      const severity = toStr(a?.severity).slice(0, 20) || 'info'
      const muscles = toStrArr(a?.muscles).slice(0, 6)
      const evidence = toStr(a?.evidence).slice(0, 240)
      const suggestion = toStr(a?.suggestion).slice(0, 240)
      if (!type && !suggestion) return null
      return { type, severity, muscles, evidence, suggestion }
    })
    .filter(Boolean)
    .slice(0, 6)

  const recommendations = recsRaw
    .map((r: any) => {
      const title = toStr(r?.title).slice(0, 80)
      const actions = toArr(r?.actions).slice(0, 5)
      if (!title && !actions.length) return null
      return { title: title || 'Recomendação', actions }
    })
    .filter(Boolean)
    .slice(0, 6)

  return {
    summary: toArr(base?.summary).slice(0, 8),
    imbalanceAlerts,
    recommendations,
  }
}

const generateWeeklyInsightsWithAi = async (apiKey: string, input: any) => {
  const schema = [
    '{',
    '  "summary": string[] (3-6),',
    '  "imbalanceAlerts": [',
    '    { "type": string, "severity": "info"|"warn"|"critical", "muscles": string[], "evidence": string, "suggestion": string }',
    '  ],',
    '  "recommendations": [',
    '    { "title": string, "actions": string[] }',
    '  ]',
    '}',
  ].join('\n')

  const prompt = [
    'Você é um coach de musculação do app IronTracks.',
    'Gere insights semanais a partir de volumes por músculo já calculados.',
    '',
    'REGRAS ABSOLUTAS:',
    '- Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
    '- Escreva em pt-BR.',
    '- Não invente números; use apenas os dados fornecidos.',
    '- Se não der para afirmar algo, omita.',
    '- Seja prático e direto.',
    '',
    'Formato (JSON):',
    schema,
    '',
    'Dados (JSON):',
    JSON.stringify(input),
  ].join('\n')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL })
  const result = await model.generateContent([{ text: prompt }] as any)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJsonFromModelText(text)
  if (!parsed) return null
  return normalizeAiInsights(parsed)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const admin = createAdminClient()

    const body = await req.json().catch(() => ({}))
    const refreshCache = Boolean(body?.refreshCache ?? body?.refresh)
    const refreshAi = Boolean(body?.refreshAi)
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const now = new Date()
    const requested = body?.weekStart ? new Date(String(body.weekStart)) : now
    const weekStart = startOfWeekUtc(Number.isFinite(requested.getTime()) ? requested : now)
    const weekEnd = addDaysUtc(weekStart, 6)

    const weekStartDate = isoDate(weekStart)
    const cacheKeyDate = weekStartDate

    let cachedPayload: any = null
    let cachedUpdatedAtMs = 0
    if (!refreshCache) {
      const { data: cached } = await admin
        .from('muscle_weekly_summaries')
        .select('payload, updated_at')
        .eq('user_id', userId)
        .eq('week_start_date', cacheKeyDate)
        .maybeSingle()

      cachedPayload = cached?.payload && typeof cached.payload === 'object' ? cached.payload : null
      cachedUpdatedAtMs = cached?.updated_at ? new Date(String(cached.updated_at)).getTime() : 0
      const fresh = Number.isFinite(cachedUpdatedAtMs) && Date.now() - cachedUpdatedAtMs < 6 * 60 * 60 * 1000
      if (cachedPayload && fresh) return NextResponse.json(cachedPayload)
    }

    const startIso = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate(), 0, 0, 0)).toISOString()
    const endIso = new Date(Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate(), 23, 59, 59)).toISOString()

    const { data: workouts } = await admin
      .from('workouts')
      .select('id, date, created_at, notes, name')
      .eq('user_id', userId)
      .eq('is_template', false)
      .gte('date', startIso)
      .lte('date', endIso)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120)

    const sessions = (Array.isArray(workouts) ? workouts : [])
      .map((w: any) => safeJsonParse(w?.notes))
      .filter((s: any) => s && typeof s === 'object')

    const exerciseKeyToCanonical = new Map<string, string>()
    for (const s of sessions) {
      const exs = Array.isArray(s?.exercises) ? s.exercises : []
      for (const ex of exs) {
        const name = toStr(ex?.name)
        if (!name) continue
        const canonical = resolveCanonicalExerciseName(name)?.canonical || name
        const key = normalizeExerciseName(canonical)
        if (!key) continue
        if (!exerciseKeyToCanonical.has(key)) exerciseKeyToCanonical.set(key, canonical || name)
      }
    }

    const exerciseKeys = Array.from(exerciseKeyToCanonical.keys()).slice(0, 400)
    const { data: maps } = exerciseKeys.length
      ? await admin
          .from('exercise_muscle_maps')
          .select('exercise_key, canonical_name, mapping, confidence, source')
          .eq('user_id', userId)
          .in('exercise_key', exerciseKeys)
      : { data: [] as any[] }

    const mapByKey = new Map<string, any>()
    for (const row of Array.isArray(maps) ? maps : []) {
      const k = toStr(row?.exercise_key)
      if (!k) continue
      mapByKey.set(k, row?.mapping && typeof row.mapping === 'object' ? row.mapping : null)
    }

    const missingPairs: { key: string; canonical: string }[] = []
    for (const [key, canonical] of Array.from(exerciseKeyToCanonical.entries())) {
      if (!mapByKey.get(key)) missingPairs.push({ key, canonical })
    }

    const heuristicRows = missingPairs
      .map((it) => buildHeuristicExerciseMap(it.canonical))
      .filter(Boolean)
      .map((it: any) => ({
        user_id: userId,
        exercise_key: it.exercise_key,
        canonical_name: it.canonical_name,
        mapping: it.mapping,
        confidence: it.confidence,
        source: 'heuristic',
      }))

    if (heuristicRows.length) {
      await admin.from('exercise_muscle_maps').upsert(heuristicRows, { onConflict: 'user_id,exercise_key' })
      for (const row of heuristicRows) mapByKey.set(String(row.exercise_key), row.mapping)
    }

    const missingCanonicals = missingPairs
      .filter((it) => !mapByKey.get(it.key))
      .map((it) => it.canonical)

    const missingUnique = Array.from(new Set(missingCanonicals.map((v) => String(v || '').trim()).filter(Boolean)))
    const mappingBatchLimit = refreshAi ? 60 : 20
    const toMapWithAi = apiKey ? missingUnique.slice(0, mappingBatchLimit) : []
    const newlyMapped = toMapWithAi.length ? await classifyExercisesWithAi(apiKey as string, toMapWithAi) : []
    if (newlyMapped.length) {
      const rows = newlyMapped.map((it: any) => ({
        user_id: userId,
        exercise_key: it.exercise_key,
        canonical_name: it.canonical_name,
        mapping: it.mapping,
        confidence: it.confidence,
        source: 'ai',
      }))
      await admin.from('exercise_muscle_maps').upsert(rows, { onConflict: 'user_id,exercise_key' })
      for (const it of newlyMapped) mapByKey.set(it.exercise_key, it.mapping)
    }

    const muscleIds = MUSCLE_GROUPS.map((m) => m.id)
    const volumes: Record<string, number> = Object.fromEntries(muscleIds.map((id) => [id, 0]))
    const unknownExercises: string[] = []
    const byMuscleByExercise = new Map<string, Map<string, number>>()
    const diagnostics = {
      estimatedSetsUsed: 0,
      sessionsWithNoLogs: 0,
      exercisesWithoutMapping: new Set<string>(),
      exercisesWithEstimatedSets: new Set<string>(),
    }

    const addContribution = (muscleId: string, exerciseName: string, value: number) => {
      if (!muscleId || !exerciseName) return
      if (!Number.isFinite(value) || value <= 0) return
      let exMap = byMuscleByExercise.get(muscleId)
      if (!exMap) {
        exMap = new Map()
        byMuscleByExercise.set(muscleId, exMap)
      }
      exMap.set(exerciseName, (exMap.get(exerciseName) || 0) + value)
    }

    for (const s of sessions) {
      const logs = s?.logs && typeof s.logs === 'object' ? s.logs : {}
      const exs = Array.isArray(s?.exercises) ? s.exercises : []
      if (Object.keys(logs).length === 0 && exs.length > 0) diagnostics.sessionsWithNoLogs += 1

      const loggedSetsByExerciseIdx = new Map<number, Set<number>>()
      for (const [k, v] of Object.entries(logs)) {
        const log = v && typeof v === 'object' ? (v as any) : null
        if (!log) continue
        const keyParts = String(k || '').split('-')
        const exIdx = Number(keyParts[0])
        if (!Number.isFinite(exIdx)) continue
        const setIdx = Number(keyParts[1])
        if (Number.isFinite(setIdx)) {
          const set = loggedSetsByExerciseIdx.get(exIdx) || new Set<number>()
          set.add(setIdx)
          loggedSetsByExerciseIdx.set(exIdx, set)
        }
        const exName = toStr(exs?.[exIdx]?.name)
        if (!exName) continue
        const isWarmup = Boolean(log?.is_warmup ?? log?.isWarmup)
        if (isWarmup) continue
        const w = Number(String(log?.weight ?? '').replace(',', '.'))
        const r = Number(String(log?.reps ?? '').replace(',', '.'))
        const hasNumbers = Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0
        const done = Boolean(log?.done) || hasNumbers
        if (!done) continue
        const effort = parseEffortFactor(log)

        const canonical = resolveCanonicalExerciseName(exName)?.canonical || exName
        const exKey = normalizeExerciseName(canonical)
        const mapping = exKey ? mapByKey.get(exKey) : null
        const contributions = Array.isArray(mapping?.contributions) ? mapping.contributions : []
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          diagnostics.exercisesWithoutMapping.add(canonical || exName)
          continue
        }
        for (const c of contributions) {
          const id = toStr((c as any)?.muscleId)
          const weight = Number((c as any)?.weight)
          if (!id || !Number.isFinite(weight) || weight <= 0) continue
          if (volumes[id] == null) continue
          const value = effort * weight
          volumes[id] += value
          addContribution(id, canonical || exName, value)
        }
      }

      for (let exIdx = 0; exIdx < exs.length; exIdx += 1) {
        const ex = exs?.[exIdx]
        const planned = plannedSetsCount(ex)
        if (planned <= 0) continue
        const logged = loggedSetsByExerciseIdx.get(exIdx)?.size || 0
        const remaining = Math.max(0, planned - logged)
        if (remaining <= 0) continue
        const exName = toStr(ex?.name)
        if (!exName) continue
        const canonical = resolveCanonicalExerciseName(exName)?.canonical || exName
        const exKey = normalizeExerciseName(canonical)
        const mapping = exKey ? mapByKey.get(exKey) : null
        const contributions = Array.isArray(mapping?.contributions) ? mapping.contributions : []
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          diagnostics.exercisesWithoutMapping.add(canonical || exName)
          continue
        }
        const effort = 0.7
        diagnostics.estimatedSetsUsed += remaining
        diagnostics.exercisesWithEstimatedSets.add(canonical || exName)
        for (const c of contributions) {
          const id = toStr((c as any)?.muscleId)
          const weight = Number((c as any)?.weight)
          if (!id || !Number.isFinite(weight) || weight <= 0) continue
          if (volumes[id] == null) continue
          const value = remaining * effort * weight
          volumes[id] += value
          addContribution(id, canonical || exName, value)
        }
      }
    }

    const muscles = Object.fromEntries(
      MUSCLE_GROUPS.map((m) => {
        const sets = Number(volumes[m.id] || 0)
        const midpoint = (Number(m.minSets) + Number(m.maxSets)) / 2
        const ratio = midpoint > 0 ? sets / midpoint : 0
        const color = colorForRatio(ratio)
        return [
          m.id,
          {
            label: m.label,
            sets: Math.round(sets * 10) / 10,
            minSets: m.minSets,
            maxSets: m.maxSets,
            ratio: Math.round(ratio * 100) / 100,
            color,
            view: m.view,
          },
        ]
      })
    )

    const sorted = MUSCLE_GROUPS.map((m) => ({ id: m.id, sets: Number(volumes[m.id] || 0), label: m.label }))
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 8)
      .map((x) => ({ ...x, sets: Math.round(x.sets * 10) / 10 }))

    const insightInput = {
      weekStartDate,
      muscles: Object.fromEntries(sorted.map((x) => [x.id, { sets: x.sets, label: x.label }])),
      targets: Object.fromEntries(MUSCLE_GROUPS.map((m) => [m.id, { minSets: m.minSets, maxSets: m.maxSets, label: m.label }])),
      workoutsCount: sessions.length,
    }

    const insightsFromAi = refreshAi && apiKey ? await generateWeeklyInsightsWithAi(apiKey, insightInput) : null
    const cachedInsights = cachedPayload?.insights && typeof cachedPayload.insights === 'object' ? cachedPayload.insights : null
    const insights = insightsFromAi || cachedInsights || { summary: [], imbalanceAlerts: [], recommendations: [] }
    const aiStatus = refreshAi ? (apiKey ? (insightsFromAi ? 'ok' : 'failed') : 'missing_api_key') : 'skipped'
    const insightsStale = !insightsFromAi && !!cachedInsights && !!cachedUpdatedAtMs

    const topExercisesByMuscle = Object.fromEntries(
      MUSCLE_GROUPS.map((m) => {
        const entries = Array.from((byMuscleByExercise.get(m.id) || new Map()).entries())
          .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
          .slice(0, 5)
          .map(([name, setsEq]) => ({ name, setsEq: Math.round(Number(setsEq || 0) * 10) / 10 }))
        return [m.id, entries]
      })
    )

    const payload = {
      ok: true,
      weekStartDate,
      weekEndDate: isoDate(weekEnd),
      workoutsCount: sessions.length,
      muscles,
      topMuscles: sorted,
      unknownExercises: Array.from(new Set(unknownExercises)).slice(0, 25),
      topExercisesByMuscle,
      diagnostics: {
        estimatedSetsUsed: diagnostics.estimatedSetsUsed,
        sessionsWithNoLogs: diagnostics.sessionsWithNoLogs,
        exercisesWithoutMapping: Array.from(diagnostics.exercisesWithoutMapping).slice(0, 40),
        exercisesWithEstimatedSets: Array.from(diagnostics.exercisesWithEstimatedSets).slice(0, 40),
      },
      insights,
      ai: {
        requested: refreshAi,
        status: aiStatus,
        insightsStale,
      },
    }

    await admin
      .from('muscle_weekly_summaries')
      .upsert({ user_id: userId, week_start_date: cacheKeyDate, payload }, { onConflict: 'user_id,week_start_date' })

    return NextResponse.json(payload)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
