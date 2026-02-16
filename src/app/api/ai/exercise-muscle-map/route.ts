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
  .passthrough()

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

const toStr = (v: any) => String(v || '').trim()

const toBool = (v: any) => Boolean(v)

const normalizeResult = (obj: any) => {
  const base = obj && typeof obj === 'object' ? obj : {}
  const itemsRaw = Array.isArray(base.items) ? base.items : []
  const muscleIds = new Set(MUSCLE_GROUPS.map((m) => m.id))

  const normalized = itemsRaw
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
          unilateral: toBool(it?.unilateral),
          confidence,
          notes: toStr(it?.notes).slice(0, 240),
        },
        confidence,
      }
    })
    .filter(Boolean)

  return { items: normalized }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const names: string[] = Array.isArray(body?.names)
      ? body.names.map((v: any) => String(v || '').trim()).filter((v: string) => Boolean(v))
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
      .filter(Boolean) as any[]

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
      return !heuristicItems.some((it) => String((it as any)?.exercise_key || '') === k)
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
    const result = await model.generateContent([{ text: prompt }] as any)
    const text = (await result?.response?.text()) || ''
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'invalid_ai_response' }, { status: 400 })

    const normalized = normalizeResult(parsed)

    const upsertRows = normalized.items.map((it: any) => ({
      user_id: userId,
      exercise_key: it.exercise_key,
      canonical_name: it.canonical_name,
      mapping: it.mapping,
      confidence: it.confidence,
      source: 'ai',
    }))

    if (upsertRows.length) {
      await admin.from('exercise_muscle_maps').upsert(upsertRows, { onConflict: 'user_id,exercise_key' })
    }

    return NextResponse.json({ ok: true, items: [...heuristicItems, ...upsertRows] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
