/**
 * Lógica compartilhada das rotas de mapeamento exercício→músculo via IA
 * (api/ai/exercise-muscle-map e .../exercise-muscle-map-backfill).
 *
 * Extraído sem mudança de comportamento — as duas rotas tinham este código
 * duplicado byte-a-byte (parse do JSON do modelo + normalização dos itens +
 * schema do prompt).
 */
import { isRecord } from '@/utils/guards'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { MUSCLE_GROUPS } from '@/utils/muscleMapConfig'
// Fonte única (re-exportada pra não quebrar quem importa daqui).
export { safeJsonParse, extractJsonFromModelText } from '@/utils/ai/extractJson'

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
 * Structured output (vai na CHAMADA, não só no texto do prompt).
 *
 * Auditoria de 02/08/2026: das 27 rotas de IA, 24 pediam JSON só no prompt — a
 * mesma classe que produziu o `protocol_failed` dos exames (o modelo caro gasta
 * budget "pensando" e trunca o JSON; cada retry é chamada paga). Este é o
 * espelho executável do `MUSCLE_MAP_JSON_SCHEMA` acima; o normalizador continua
 * sendo o juiz final (filtra muscleId inválido e re-normaliza pesos).
 */
export const MUSCLE_MAP_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      maxItems: 40,
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          canonical_name: { type: 'STRING' },
          contributions: {
            type: 'ARRAY',
            maxItems: 12,
            items: {
              type: 'OBJECT',
              properties: {
                muscleId: { type: 'STRING' },
                weight: { type: 'NUMBER' },
                role: { type: 'STRING', enum: ['primary', 'secondary', 'stabilizer'] },
              },
              required: ['muscleId', 'weight', 'role'],
              propertyOrdering: ['muscleId', 'weight', 'role'],
            },
          },
          unilateral: { type: 'BOOLEAN' },
          confidence: { type: 'NUMBER' },
          notes: { type: 'STRING' },
        },
        required: ['name', 'canonical_name', 'contributions', 'unilateral', 'confidence', 'notes'],
        propertyOrdering: ['name', 'canonical_name', 'contributions', 'unilateral', 'confidence', 'notes'],
      },
    },
  },
  required: ['items'],
} as const

export const muscleMapGenerationConfig = () => ({
  responseMimeType: 'application/json',
  responseSchema: MUSCLE_MAP_RESPONSE_SCHEMA,
  maxOutputTokens: 8000,
  temperature: 0.3,
})

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
