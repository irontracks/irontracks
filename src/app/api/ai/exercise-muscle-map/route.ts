import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    names: z.array(z.string().min(1)).min(1).max(60),
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

const toBool = (v: unknown) => Boolean(v)

const normalizeResult = (obj: unknown): { items: Array<Record<string, unknown>> } => {
  const base = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  const itemsRaw = Array.isArray(base.items) ? (base.items as unknown[]) : []
  const muscleIds = new Set<string>(MUSCLE_GROUPS.map((m) => m.id))

  const normalized = itemsRaw
    .map((it: unknown) => {
      const item = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
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
          unilateral: toBool(item?.unilateral),
          confidence,
          notes: toStr(item?.notes).slice(0, 240),
        },
        confidence,
      }
    })
    .filter(Boolean)

  return { items: (normalized.filter(isRecord) as Array<Record<string, unknown>>) }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const names: string[] = Array.isArray(body?.names)
      ? (body.names as unknown[]).map((v: unknown) => String(v || '').trim()).filter((v: string) => Boolean(v))
      : []
    if (!names.length) return NextResponse.json({ ok: false, error: 'names required' }, { status: 400 })

    const unique: string[] = Array.from(new Set(names)).slice(0, 60)
    const userId = String(auth.user.id || '').trim()
    const admin = createAdminClient()

    const heuristicItems = unique
      .map((name) => {
        const canonical = resolveCanonicalExerciseName(name)?.canonical || name
        return buildHeuristicExerciseMap(canonical)
      })
      .filter(isRecord) as Array<Record<string, unknown>>

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
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: true, items: heuristicItems })
    }

    const remaining = unique.filter((name) => {
      const canonical = resolveCanonicalExerciseName(name)?.canonical || name
      const k = normalizeExerciseName(canonical || name)
      return !heuristicItems.some((it) => String((it as Record<string, unknown>)?.exercise_key || '') === k)
    })
    if (!remaining.length) return NextResponse.json({ ok: true, items: heuristicItems })
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
      '- Não invente equipamentos; use o nome do exercício para inferir.',
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
      JSON.stringify(remaining),
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'invalid_ai_response' }, { status: 400 })

    const normalized = normalizeResult(parsed)

    const upsertRows = normalized.items.map((it: unknown) => {
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

    if (upsertRows.length) {
      await admin.from('exercise_muscle_maps').upsert(upsertRows, { onConflict: 'user_id,exercise_key' })
    }

    return NextResponse.json({ ok: true, items: [...heuristicItems, ...upsertRows] })
  } catch (e: any) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}
