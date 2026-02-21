import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    days: z.coerce.number().optional(),
    maxAi: z.coerce.number().optional(),
  })
  .strip()

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: string) => {
  try {
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

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

const toStr = (v: unknown) => String(v || '').trim()

const normalizeAiItems = (obj: unknown): Array<Record<string, unknown>> => {
  const base = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  const itemsRaw = Array.isArray(base.items) ? (base.items as unknown[]) : []
  const muscleIds = new Set<string>(MUSCLE_GROUPS.map((m) => m.id))

  const items = itemsRaw
    .map((it: unknown) => {
      const item = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
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
          const cc = c && typeof c === 'object' ? (c as Record<string, unknown>) : {}
          const muscleId = toStr(cc?.muscleId || cc?.id)
          if (!muscleId || typeof muscleId !== 'string' || !muscleIds.has(muscleId)) return null
          const weight = Number(cc?.weight)
          if (!Number.isFinite(weight) || weight <= 0) return null
          const role = toStr(cc?.role || cc?.type || 'primary') || 'primary'
          return { muscleId, weight, role }
        })
        .filter(Boolean)

      const weightSum = contributions.reduce(
        (acc: number, c: unknown) => acc + (Number((c as Record<string, unknown>)?.weight) || 0),
        0,
      )
      const normalizedContrib =
        weightSum > 0
          ? contributions.map((c: unknown) => {
              const cc = c as Record<string, unknown>
              return { ...cc, weight: (Number(cc.weight) || 0) / weightSum }
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

  return items.filter(isRecord) as Record<string, unknown>[]
}

const classifyExercisesWithAi = async (apiKey: string, names: string[]) => {
  const unique = Array.from(new Set(names.map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 60)
  if (!unique.length) return []
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
    JSON.stringify(unique),
  ].join('\n')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: MODEL })
  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const parsed = extractJsonFromModelText(text)
  if (!parsed) return []
  return normalizeAiItems(parsed)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    const admin = createAdminClient()

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const daysRaw = Number(body?.days ?? 365)
    const days = Number.isFinite(daysRaw) ? Math.min(3650, Math.max(7, Math.floor(daysRaw))) : 365
    const maxAiRaw = Number(body?.maxAi ?? 240)
    const maxAi = Number.isFinite(maxAiRaw) ? Math.min(600, Math.max(0, Math.floor(maxAiRaw))) : 240

    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    const startIso = start.toISOString()

    const names = new Set<string>()
    let scannedWorkouts = 0

    for (let offset = 0; offset < 3000; offset += 1000) {
      const { data } = await admin
        .from('workouts')
        .select('notes, date, created_at')
        .eq('user_id', userId)
        .eq('is_template', false)
        .gte('date', startIso)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + 999)

      const list = Array.isArray(data) ? data : []
      if (!list.length) break
      scannedWorkouts += list.length

      for (const w of list) {
        const sRaw = safeJsonParse(String((w as Record<string, unknown>)?.notes || ''))
        const s = isRecord(sRaw) ? sRaw : null
        const exs = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
        for (const ex of exs) {
          const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
          const name = toStr(exObj?.name)
          if (!name) continue
          const canonical = resolveCanonicalExerciseName(name)?.canonical || name
          const safe = String(canonical || '').trim()
          if (safe) names.add(safe)
        }
      }
    }

    const uniqueCanonicals = Array.from(names)
    const exerciseKeyToCanonical = new Map<string, string>()
    for (const c of uniqueCanonicals) {
      const key = normalizeExerciseName(c)
      if (!key) continue
      if (!exerciseKeyToCanonical.has(key)) exerciseKeyToCanonical.set(key, c)
    }

    const keys = Array.from(exerciseKeyToCanonical.keys())
    const existing = new Set<string>()
    for (let i = 0; i < keys.length; i += 400) {
      const chunk = keys.slice(i, i + 400)
      const { data } = await admin
        .from('exercise_muscle_maps')
        .select('exercise_key')
        .eq('user_id', userId)
        .in('exercise_key', chunk)
      for (const r of Array.isArray(data) ? data : []) {
        const k = toStr((r as Record<string, unknown>)?.exercise_key)
        if (k) existing.add(k)
      }
    }

    const missingCanonicals = keys
      .filter((k) => !existing.has(k))
      .map((k) => exerciseKeyToCanonical.get(k) || '')
      .filter(Boolean)

    const heuristicItems = missingCanonicals.map((c) => buildHeuristicExerciseMap(c)).filter(isRecord) as Array<Record<string, unknown>>
    if (heuristicItems.length) {
      const rows = heuristicItems.map((it) => ({
        user_id: userId,
        exercise_key: it.exercise_key,
        canonical_name: it.canonical_name,
        mapping: it.mapping,
        confidence: it.confidence,
        source: 'heuristic',
      }))
      await admin.from('exercise_muscle_maps').upsert(rows, { onConflict: 'user_id,exercise_key' })
      for (const it of heuristicItems) existing.add(String((it as Record<string, unknown>)?.exercise_key || ''))
    }

    const stillMissing = keys
      .filter((k) => !existing.has(k))
      .map((k) => exerciseKeyToCanonical.get(k) || '')
      .filter(Boolean)

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    let aiMapped = 0
    if (apiKey && maxAi > 0 && stillMissing.length) {
      const queue = Array.from(new Set(stillMissing)).slice(0, maxAi)
      for (let i = 0; i < queue.length; i += 60) {
        const batch = queue.slice(i, i + 60)
        const mapped = await classifyExercisesWithAi(apiKey, batch)
        const rows = mapped.map((it: unknown) => {
          const row = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
          return ({
            user_id: userId,
            exercise_key: row.exercise_key,
            canonical_name: row.canonical_name,
            mapping: row.mapping,
            confidence: row.confidence,
            source: 'ai',
          })
        })
        if (rows.length) {
          await admin.from('exercise_muscle_maps').upsert(rows, { onConflict: 'user_id,exercise_key' })
          aiMapped += rows.length
          for (const r of rows) existing.add(String(r.exercise_key))
        }
      }
    }

    const remainingAfter = keys
      .filter((k) => !existing.has(k))
      .map((k) => exerciseKeyToCanonical.get(k) || '')
      .filter(Boolean)

    return NextResponse.json({
      ok: true,
      days,
      scannedWorkouts,
      uniqueExercises: exerciseKeyToCanonical.size,
      heuristicMapped: heuristicItems.length,
      aiMapped,
      remainingUnmapped: remainingAfter.slice(0, 50),
    })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}
