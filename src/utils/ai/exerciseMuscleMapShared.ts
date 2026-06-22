/**
 * Lógica compartilhada das rotas de mapeamento exercício→músculo via IA
 * (api/ai/exercise-muscle-map e .../exercise-muscle-map-backfill).
 *
 * Extraído sem mudança de comportamento — as duas rotas tinham este código
 * duplicado byte-a-byte (parse do JSON do modelo + normalização dos itens +
 * schema do prompt).
 */
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'
import { isRecord } from '@/utils/guards'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'

export const safeJsonParse = (raw: string) => parseJsonWithSchema(raw, z.unknown())

export const extractJsonFromModelText = (text: string) => {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

const toStr = (v: unknown) => String(v || '').trim()

/** Formato JSON esperado do modelo (string usada no prompt). */
export const MUSCLE_MAP_JSON_SCHEMA = [
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

/**
 * Normaliza a resposta do modelo em linhas de exercise_muscle_maps.
 * Retorna o array de itens (cada um com exercise_key, canonical_name, mapping,
 * confidence). Filtra muscleId inválidos, pesos não-positivos, e normaliza os
 * pesos pra somar ~1.0.
 */
export const normalizeAiMuscleItems = (obj: unknown): Array<Record<string, unknown>> => {
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
