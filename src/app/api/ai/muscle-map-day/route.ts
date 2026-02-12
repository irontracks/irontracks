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

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const isIsoDate = (v: any) => {
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

const plannedSetsCount = (exercise: any) => {
  const ex = exercise && typeof exercise === 'object' ? exercise : {}
  const setsArr = Array.isArray(ex?.sets) ? ex.sets : null
  if (setsArr) return setsArr.length
  const n = Number(ex?.sets ?? ex?.setsCount ?? ex?.setCount)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 0
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
      const canonical = toStr(it?.canonical_name || it?.canonicalName || it?.canonical) || (name ? resolveCanonicalExerciseName(name)?.canonical : '')
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
      const normalizedContrib = weightSum > 0 ? contributions.map((c: any) => ({ ...c, weight: (Number(c.weight) || 0) / weightSum })) : []

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
  const result = await model.generateContent([{ text: prompt }] as any)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJsonFromModelText(text)
  if (!parsed) return []
  return normalizeAiExerciseMap(parsed)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const admin = createAdminClient()

    const body = await req.json().catch(() => ({}))
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

    const exerciseKeys = Array.from(exerciseKeyToCanonical.keys()).slice(0, 1200)
    const { data: maps } = exerciseKeys.length
      ? await admin
          .from('exercise_muscle_maps')
          .select('exercise_key, mapping')
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
        let newlyMapped: any[] = []
        try {
          newlyMapped = await classifyExercisesWithAi(apiKey, batch)
        } catch (e: any) {
          aiError = e?.message ? String(e.message) : String(e)
          ai.status = aiError.includes('429') ? 'rate_limited' : 'failed'
          ai.error = aiError
          break
        }
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
          continue
        }
        for (const c of contributions) {
          const id = toStr((c as any)?.muscleId)
          const weight = Number((c as any)?.weight)
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
        const contributions = Array.isArray(mapping?.contributions) ? mapping.contributions : []
        if (!contributions.length) {
          unknownExercises.push(canonical || exName)
          continue
        }
        const effort = 0.7
        diagnostics.estimatedSetsUsed += remaining
        for (const c of contributions) {
          const id = toStr((c as any)?.muscleId)
          const weight = Number((c as any)?.weight)
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
