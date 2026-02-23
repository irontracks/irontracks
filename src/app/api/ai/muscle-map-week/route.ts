import { NextResponse } from 'next/server'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimit, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    refreshCache: z.boolean().optional(),
    refresh: z.boolean().optional(),
    refreshAi: z.boolean().optional(),
    weekStart: z.union([z.string(), z.number(), z.date()]).optional(),
  })
  .strip()

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const AiExerciseMuscleMapSchema = z
  .object({
    exercises: z.array(
      z.object({
        name: z.string(),
        muscles: z.array(
          z.object({
            id: z.string(),
            sets_equivalent: z.number().optional(),
            confidence: z.number().min(0).max(1).optional(),
          })
        ),
      })
    ),
  })
  .strip()

type AiExerciseMuscleMap = z.infer<typeof AiExerciseMuscleMapSchema>

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

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

const toStr = (v: unknown): string => String(v || '').trim()

const normalizeMuscleId = (raw: unknown, allowed: Set<string>) => {
  const id = String(raw || '').trim().toLowerCase()
  if (!id) return ''
  if (allowed.has(id)) return id
  if (id === 'abdominal' || id === 'abdominals' || id === 'abdomen' || id === 'core' || id === 'obliques' || id === 'oblique') return 'abs'
  return ''
}

const DEFAULT_MUSCLE_ID_SET = new Set(MUSCLE_GROUPS.map((m) => m.id))

const normalizeContributions = (mapping: unknown, allowed: Set<string>) => {
  const raw = mapping && typeof mapping === 'object' ? (mapping as Record<string, unknown>) : null
  const contributionsRaw = raw && Array.isArray(raw?.contributions) ? (raw.contributions as unknown[]) : []
  return contributionsRaw
    .map((c) => {
      const obj = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
      const id = normalizeMuscleId(obj?.muscleId, allowed)
      const weight = Number(obj?.weight)
      if (!id || !Number.isFinite(weight) || weight <= 0) return null
      return { muscleId: id, weight }
    })
    .filter(Boolean)
}

const hasValidMapping = (mapping: unknown, allowed: Set<string>) => {
  return normalizeContributions(mapping, allowed).length > 0
}

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

const parseEffortFactor = (log: unknown) => {
  const l = log && typeof log === 'object' ? (log as Record<string, unknown>) : {}
  const rirRaw = l?.rir ?? l?.RIR
  const rpeRaw = l?.rpe ?? l?.RPE
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

const parseNumber = (raw: unknown) => {
  const n = Number(String(raw ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const isSetDone = (log: unknown) => {
  if (!log || typeof log !== 'object') return false
  const logObj = log as Record<string, unknown>
  if (Boolean(logObj?.done)) return true
  const reps = parseNumber(logObj?.reps)
  return reps != null && reps > 0
}

const plannedSetsCount = (exercise: unknown) => {
  const ex = exercise && typeof exercise === 'object' ? (exercise as Record<string, unknown>) : ({} as Record<string, unknown>)
  const setsArr = Array.isArray(ex?.sets) ? (ex.sets as unknown[]) : null
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

const normalizeAiExerciseMap = (obj: unknown) => {
  const baseObj = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : ({} as Record<string, unknown>)
  const itemsRaw = Array.isArray(baseObj.items)
    ? (baseObj.items as unknown[])
    : Array.isArray(baseObj.exercises)
      ? (baseObj.exercises as unknown[])
      : []
  const muscleIds: Set<string> = new Set(MUSCLE_GROUPS.map((m) => m.id))

  const items = itemsRaw
    .map((it: unknown) => {
      const item = it && typeof it === 'object' ? (it as Record<string, unknown>) : ({} as Record<string, unknown>)
      const name = toStr(item?.name)
      const canonical =
        toStr(item?.canonical_name || item?.canonicalName || item?.canonical) || (name ? resolveCanonicalExerciseName(name)?.canonical : '')
      const key = normalizeExerciseName(canonical || name)
      if (!key) return null

      const contribRaw = Array.isArray(item?.contributions)
        ? (item.contributions as unknown[])
        : Array.isArray(item?.muscles)
          ? (item.muscles as unknown[])
          : []
      const contributions = contribRaw
        .map((c: unknown) => {
          const contrib = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
          const muscleId = toStr(contrib?.muscleId || contrib?.id)
          if (!muscleId || !muscleIds.has(muscleId)) return null
          const weight = Number(contrib?.weight ?? contrib?.sets_equivalent)
          if (!Number.isFinite(weight) || weight <= 0) return null
          const role = toStr(contrib?.role || contrib?.type || 'primary') || 'primary'
          return { muscleId, weight, role }
        })
        .filter(Boolean)

      const weightSum = contributions.reduce((acc: number, c: unknown) => {
        const contrib = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
        return acc + (Number(contrib?.weight) || 0)
      }, 0)
      const normalizedContrib =
        weightSum > 0
          ? contributions.map((c: unknown) => {
              const contrib = c && typeof c === 'object' ? (c as Record<string, unknown>) : ({} as Record<string, unknown>)
              return { ...contrib, weight: (Number(contrib.weight) || 0) / weightSum }
            })
          : []

      const confidenceRaw = Number(item?.confidence)
      const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.6

      return {
        exercise_key: key,
        canonical_name: canonical || name,
        mapping: {
          contributions: normalizedContrib,
          unilateral: Boolean(item?.unilateral),
          confidence,
          notes: toStr(item?.notes).slice(0, 240),
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
  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const rawParsed = extractJsonFromModelText(text)
  const validationResult = AiExerciseMuscleMapSchema.safeParse(rawParsed)
  let aiData: AiExerciseMuscleMap =
    validationResult.success
      ? validationResult.data
      : { exercises: [] }
  if (!validationResult.success) {
    const baseObj = rawParsed && typeof rawParsed === 'object' ? (rawParsed as Record<string, unknown>) : ({} as Record<string, unknown>)
    const items = Array.isArray(baseObj.items) ? (baseObj.items as unknown[]) : []
    const adapted = {
      exercises: items.map((it) => {
        const obj = it && typeof it === 'object' ? (it as Record<string, unknown>) : ({} as Record<string, unknown>)
        const musclesRaw = Array.isArray(obj?.contributions)
          ? (obj.contributions as unknown[])
          : Array.isArray(obj?.muscles)
            ? (obj.muscles as unknown[])
            : []
        return {
          name: String(obj?.name ?? ''),
          muscles: musclesRaw.map((m: unknown) => {
            const muscle = m && typeof m === 'object' ? (m as Record<string, unknown>) : ({} as Record<string, unknown>)
            return {
              id: String(muscle?.muscleId ?? muscle?.id ?? ''),
              sets_equivalent: muscle?.weight ?? muscle?.sets_equivalent,
              confidence: muscle?.confidence,
            }
          }),
        }
      }),
    }
    const second = AiExerciseMuscleMapSchema.safeParse(adapted)
    aiData = second.success ? second.data : { exercises: [] }
  }
  const exercises = aiData.exercises
  return normalizeAiExerciseMap({ exercises })
}

const normalizeAiInsights = (obj: unknown) => {
  const base = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  const toArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const toStrArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const alertsRaw = Array.isArray(base?.imbalanceAlerts) ? base.imbalanceAlerts : []
  const recsRaw = Array.isArray(base?.recommendations) ? base.recommendations : []
  const imbalanceAlerts = alertsRaw
    .map((a: unknown) => {
      const aObj = a && typeof a === 'object' ? (a as Record<string, unknown>) : {}
      const type = toStr(aObj?.type).slice(0, 60)
      const severity = toStr(aObj?.severity).slice(0, 20) || 'info'
      const muscles = toStrArr(aObj?.muscles).slice(0, 6)
      const evidence = toStr(aObj?.evidence).slice(0, 240)
      const suggestion = toStr(aObj?.suggestion).slice(0, 240)
      if (!type && !suggestion) return null
      return { type, severity, muscles, evidence, suggestion }
    })
    .filter(Boolean)
    .slice(0, 6)

  const recommendations = recsRaw
    .map((r: unknown) => {
      const rObj = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
      const title = toStr(rObj?.title).slice(0, 80)
      const actions = toArr(rObj?.actions).slice(0, 5)
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

const generateWeeklyInsightsWithAi = async (apiKey: string, input: unknown) => {
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
  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJsonFromModelText(text)
  if (!parsed) return null
  return normalizeAiInsights(parsed)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()
    const access = await checkVipFeatureAccess(supabase, userId, 'analytics')
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }
    const ip = getRequestIp(req)
    const rl = checkRateLimit(`ai:muscle-map-week:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    const admin = createAdminClient()

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const refreshCache = Boolean(body?.refreshCache ?? body?.refresh)
    const refreshAi = Boolean(body?.refreshAi)
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    const now = new Date()
    const requested = body?.weekStart ? new Date(String(body.weekStart)) : now
    const weekStart = startOfWeekUtc(Number.isFinite(requested.getTime()) ? requested : now)
    const weekEnd = addDaysUtc(weekStart, 6)

    const weekStartDate = isoDate(weekStart)
    const cacheKeyDate = weekStartDate

    let cachedPayload: Record<string, unknown> | null = null
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

    const workoutRows = (Array.isArray(workouts) ? workouts : []) as Array<Record<string, unknown>>
    const sessions = workoutRows.map((w) => safeJsonParse(w?.notes)).filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))

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
      : { data: [] as Array<Record<string, unknown>> }

    const mapByKey = new Map<string, unknown>()
    const mapRows = (Array.isArray(maps) ? maps : []) as Array<Record<string, unknown>>
    for (const row of mapRows) {
      const k = toStr(row?.exercise_key)
      if (!k) continue
      const mapping = row?.mapping && typeof row.mapping === 'object' ? row.mapping : null
      mapByKey.set(k, hasValidMapping(mapping, DEFAULT_MUSCLE_ID_SET) ? mapping : null)
    }

    const missingPairs: { key: string; canonical: string }[] = []
    for (const [key, canonical] of Array.from(exerciseKeyToCanonical.entries())) {
      if (!mapByKey.get(key)) missingPairs.push({ key, canonical })
    }

    const heuristicRows = missingPairs
      .map((it) => buildHeuristicExerciseMap(it.canonical))
      .filter(Boolean)
      .map((it: unknown) => {
        const row = it && typeof it === 'object' ? (it as Record<string, unknown>) : ({} as Record<string, unknown>)
        return {
          user_id: userId,
          exercise_key: row.exercise_key,
          canonical_name: row.canonical_name,
          mapping: row.mapping,
          confidence: row.confidence,
          source: 'heuristic',
        }
      })

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
    let newlyMapped: Array<Record<string, unknown>> = []
    if (toMapWithAi.length) {
      try {
        newlyMapped = (await classifyExercisesWithAi(apiKey as string, toMapWithAi)) as Array<Record<string, unknown>>
      } catch {}
    }
    if (newlyMapped.length) {
      const rows = newlyMapped.map((it: Record<string, unknown>) => ({
        user_id: userId,
        exercise_key: it.exercise_key,
        canonical_name: it.canonical_name,
        mapping: it.mapping,
        confidence: it.confidence,
        source: 'ai',
      }))
      await admin.from('exercise_muscle_maps').upsert(rows, { onConflict: 'user_id,exercise_key' })
      for (const it of newlyMapped) {
        const k = toStr(it.exercise_key)
        if (!k) continue
        mapByKey.set(k, it.mapping ?? null)
      }
    }

    const muscleIds = MUSCLE_GROUPS.map((m) => m.id)
    const muscleIdSet = new Set(muscleIds)
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
        const log = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
        if (!log) continue
        const keyParts = String(k || '').split('-')
        const exIdx = Number(keyParts[0])
        if (!Number.isFinite(exIdx)) continue
        const setIdx = Number(keyParts[1])
        const exName = toStr(exs?.[exIdx]?.name)
        if (!exName) continue
        const isWarmup = Boolean(log?.is_warmup ?? log?.isWarmup)
        if (isWarmup) continue
        const done = isSetDone(log)
        if (!done) continue
        if (Number.isFinite(setIdx)) {
          const set = loggedSetsByExerciseIdx.get(exIdx) || new Set<number>()
          set.add(setIdx)
          loggedSetsByExerciseIdx.set(exIdx, set)
        }
        const effort = parseEffortFactor(log)

        const canonical = resolveCanonicalExerciseName(exName)?.canonical || exName
        const exKey = normalizeExerciseName(canonical)
        const mapping = exKey ? mapByKey.get(exKey) : null
        const mappingObj = mapping && typeof mapping === 'object' ? (mapping as Record<string, unknown>) : ({} as Record<string, unknown>)
        const contributionsRaw = Array.isArray(mappingObj?.contributions) ? (mappingObj.contributions as unknown[]) : []
        const contributions = contributionsRaw
          .map((c) => {
            const obj = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
            const id = normalizeMuscleId(obj?.muscleId, muscleIdSet)
            const weight = Number(obj?.weight)
            if (!id || !Number.isFinite(weight) || weight <= 0) return null
            return { muscleId: id, weight }
          })
          .filter((c): c is { muscleId: string; weight: number } => Boolean(c))
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          diagnostics.exercisesWithoutMapping.add(canonical || exName)
          continue
        }
        for (const c of contributions) {
          const id: string = toStr(c.muscleId)
          const weight = Number(c.weight)
          if (!id || !Number.isFinite(weight) || weight <= 0) continue
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
        const mappingObj = mapping && typeof mapping === 'object' ? (mapping as Record<string, unknown>) : ({} as Record<string, unknown>)
        const contributionsRaw = Array.isArray(mappingObj?.contributions) ? (mappingObj.contributions as unknown[]) : []
        const contributions = contributionsRaw
          .map((c) => {
            const obj = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
            const id = normalizeMuscleId(obj?.muscleId, muscleIdSet)
            const weight = Number(obj?.weight)
            if (!id || !Number.isFinite(weight) || weight <= 0) return null
            return { muscleId: id, weight }
          })
          .filter((c): c is { muscleId: string; weight: number } => Boolean(c))
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          diagnostics.exercisesWithoutMapping.add(canonical || exName)
          continue
        }
        const effort = 0.7
        diagnostics.estimatedSetsUsed += remaining
        diagnostics.exercisesWithEstimatedSets.add(canonical || exName)
        for (const c of contributions) {
          const id: string = toStr(c.muscleId)
          const weight = Number(c.weight)
          if (!id || !Number.isFinite(weight) || weight <= 0) continue
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

    let insightsFromAi = null
    let aiError = ''
    if (refreshAi && apiKey) {
      try {
        insightsFromAi = await generateWeeklyInsightsWithAi(apiKey, insightInput)
      } catch (e: unknown) {
        aiError = String((e as Error)?.message ?? e)
      }
    }
    const cachedInsights = cachedPayload?.insights && typeof cachedPayload.insights === 'object' ? cachedPayload.insights : null
    const insights = insightsFromAi || cachedInsights || { summary: [], imbalanceAlerts: [], recommendations: [] }
    const aiStatus = refreshAi
      ? apiKey
        ? insightsFromAi
          ? 'ok'
          : aiError.includes('429')
            ? 'rate_limited'
            : 'failed'
        : 'missing_api_key'
      : 'skipped'
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
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
}
