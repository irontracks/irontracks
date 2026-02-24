import { NextResponse } from 'next/server'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    date: z.string().optional(),
    tzOffsetMinutes: z.coerce.number().optional(),
    refreshAi: z.boolean().optional(),
    maxAi: z.coerce.number().optional(),
    batchLimit: z.coerce.number().optional(),
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

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const isIsoDate = (v: unknown) => {
  const s = String(v || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

const localDayRangeUtc = (dateIso: string, tzOffsetMinutes: number) => {
  const [y, m, d] = String(dateIso).split('-').map((x) => Number(x))
  const baseUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0)
  const offsetMs = Number(tzOffsetMinutes) * 60 * 1000
  const startMs = baseUtcMs + offsetMs
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() }
}

const plannedSetsCount = (exercise: unknown) => {
  const ex = exercise && typeof exercise === 'object' ? (exercise as Record<string, unknown>) : ({} as Record<string, unknown>)
  const setsArr = Array.isArray(ex?.sets) ? (ex.sets as unknown[]) : null
  if (setsArr) return setsArr.length
  const n = Number(ex?.sets ?? ex?.setsCount ?? ex?.setCount)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 0
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
      const canonical = toStr(item?.canonical_name || item?.canonicalName || item?.canonical) || (name ? resolveCanonicalExerciseName(name)?.canonical : '')
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

  return items as Record<string, unknown>[]
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
    'Objetivo: mapear exercícios para músculos alvo, para calcular volume por músculo em um dia específico.',
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
    const rl = await checkRateLimitAsync(`ai:muscle-map-day:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    const admin = createAdminClient()

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const date = String(body?.date || '').trim()
    const tzOffsetMinutesRaw = Number(body?.tzOffsetMinutes)
    const tzOffsetMinutes = Number.isFinite(tzOffsetMinutesRaw) ? clamp(tzOffsetMinutesRaw, -840, 840) : 0
    if (!isIsoDate(date)) return NextResponse.json({ ok: false, error: 'date inválido (YYYY-MM-DD)' }, { status: 400 })

    const refreshAi = Boolean(body?.refreshAi)
    const maxAiRaw = Number(body?.maxAi)
    const maxAi = Number.isFinite(maxAiRaw) ? clamp(maxAiRaw, 0, 800) : 300
    const batchLimitRaw = Number(body?.batchLimit)
    const batchLimit = Number.isFinite(batchLimitRaw) ? clamp(batchLimitRaw, 10, 80) : 40
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

    const { startIso, endIso } = localDayRangeUtc(date, tzOffsetMinutes)

    const { data: workouts } = await admin
      .from('workouts')
      .select('id, date, created_at, notes, name')
      .eq('user_id', userId)
      .eq('is_template', false)
      .gte('date', startIso)
      .lte('date', endIso)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300)

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

    const exerciseKeys = Array.from(exerciseKeyToCanonical.keys()).slice(0, 1200)
    const { data: maps } = exerciseKeys.length
      ? await admin
          .from('exercise_muscle_maps')
          .select('exercise_key, mapping')
          .eq('user_id', userId)
          .in('exercise_key', exerciseKeys)
      : { data: [] as Array<Record<string, unknown>> }

    const mapByKey = new Map<string, unknown>()
    const mapRows = (Array.isArray(maps) ? maps : []) as Array<Record<string, unknown>>
    for (const row of mapRows) {
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

    const missingCanonicals = missingPairs.filter((it) => !mapByKey.get(it.key)).map((it) => it.canonical)
    const missingUnique = Array.from(new Set(missingCanonicals.map((v) => String(v || '').trim()).filter(Boolean)))

    const ai = { requested: refreshAi, status: refreshAi ? (apiKey ? 'pending' : 'missing_api_key') : 'skipped', mapped: 0, remaining: missingUnique.length, error: '' }

    if (refreshAi && apiKey && missingUnique.length && maxAi > 0) {
      let cursor = 0
      let aiBudgetUsed = 0
      let aiError = ''
      while (cursor < missingUnique.length && aiBudgetUsed < maxAi) {
        const batchSize = Math.min(batchLimit, maxAi - aiBudgetUsed)
        const batch = missingUnique.slice(cursor, cursor + batchSize)
        if (!batch.length) break
        let newlyMapped: Array<Record<string, unknown>> = []
        try {
          newlyMapped = await classifyExercisesWithAi(apiKey, batch)
        } catch (e: unknown) {
          aiError = String((e as Error)?.message ?? e)
          ai.status = aiError.includes('429') ? 'rate_limited' : 'failed'
          ai.error = aiError
          break
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
          ai.mapped += newlyMapped.length
        }
        aiBudgetUsed += batch.length
        cursor += batch.length
      }
      if (!aiError && ai.status === 'pending') ai.status = 'ok'
    }

    const muscleIds = MUSCLE_GROUPS.map((m) => m.id)
    const volumes: Record<string, number> = Object.fromEntries(muscleIds.map((id) => [id, 0]))
    const unknownExercises: string[] = []
    const diagnostics = { estimatedSetsUsed: 0, sessionsWithNoLogs: 0 }

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
        const mappingObj = mapping && typeof mapping === 'object' ? (mapping as Record<string, unknown>) : ({} as Record<string, unknown>)
        const contributionsRaw = Array.isArray(mappingObj?.contributions) ? (mappingObj.contributions as unknown[]) : []
        const contributions = contributionsRaw
          .map((c) => {
            const raw = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
            if (!raw) return null
            const id = toStr(raw?.muscleId)
            const weight = Number(raw?.weight)
            if (!id || !Number.isFinite(weight) || weight <= 0) return null
            return { muscleId: id, weight }
          })
          .filter((c): c is { muscleId: string; weight: number } => Boolean(c))
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          continue
        }
        for (const c of contributions) {
          const id: string = toStr(c.muscleId)
          const weight = Number(c.weight)
          if (!id || !Number.isFinite(weight) || weight <= 0) continue
          if (volumes[id] == null) continue
          const value = effort * weight
          volumes[id] += value
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
            const raw = c && typeof c === 'object' ? (c as Record<string, unknown>) : null
            if (!raw) return null
            const id = toStr(raw?.muscleId)
            const weight = Number(raw?.weight)
            if (!id || !Number.isFinite(weight) || weight <= 0) return null
            return { muscleId: id, weight }
          })
          .filter((c): c is { muscleId: string; weight: number } => Boolean(c))
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          continue
        }
        const effort = 0.7
        diagnostics.estimatedSetsUsed += remaining
        for (const c of contributions) {
          const id: string = toStr(c.muscleId)
          const weight = Number(c.weight)
          if (!id || !Number.isFinite(weight) || weight <= 0) continue
          if (volumes[id] == null) continue
          const value = remaining * effort * weight
          volumes[id] += value
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

    const payload = {
      ok: true,
      date,
      workoutsCount: sessions.length,
      muscles,
      unknownExercises: Array.from(new Set(unknownExercises)).slice(0, 80),
      diagnostics,
      ai: {
        requested: refreshAi,
        status: ai.status,
        mapped: ai.mapped,
        remaining: Array.from(new Set(missingCanonicals.filter((it) => !mapByKey.get(normalizeExerciseName(it))))).length,
      },
    }

    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 500 })
  }
}
