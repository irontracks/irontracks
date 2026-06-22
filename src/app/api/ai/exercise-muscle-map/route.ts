import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { isRecord } from '@/utils/guards'
import { extractJsonFromModelText, normalizeAiMuscleItems, MUSCLE_MAP_JSON_SCHEMA } from '@/utils/ai/exerciseMuscleMapShared'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    names: z.array(z.string().min(1)).min(1).max(60),
  })
  .strip()

const MODEL = env.gemini.modelId

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
    const rl = await checkRateLimitAsync(`ai:exercise-muscle-map:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const names: string[] = Array.isArray(body?.names)
      ? (body.names as unknown[]).map((v: unknown) => String(v || '').trim()).filter((v: string) => Boolean(v))
      : []
    if (!names.length) return NextResponse.json({ ok: false, error: 'names required' }, { status: 400 })

    const unique: string[] = Array.from(new Set(names)).slice(0, 60)
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

    const apiKey = env.gemini.apiKey
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
      MUSCLE_MAP_JSON_SCHEMA,
      '',
      'Exercícios para mapear (array):',
      JSON.stringify(remaining),
    ].join('\n')

    const model = getGeminiModel(apiKey, MODEL)
    const geminiResult = await safeGemini('exercise-muscle-map', () =>
      model.generateContent(prompt),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value
    const text = (await result?.response?.text()) || ''
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'invalid_ai_response' }, { status: 400 })

    const normalizedItems = normalizeAiMuscleItems(parsed)

    const upsertRows = normalizedItems.map((it: unknown) => {
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
  } catch (e: unknown) {
    return handleGeminiError('exercise-muscle-map', e)
  }
}
