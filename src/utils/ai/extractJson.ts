/**
 * Extração de JSON da resposta de um modelo de IA — fonte única.
 *
 * Este corpo estava duplicado byte-a-byte em três lugares (muscleMapWeekHelpers,
 * exerciseMuscleMapShared, lib/nutrition/aiEstimate). Modelos às vezes devolvem o
 * JSON embrulhado em prosa/```json; tenta parse direto e, se falhar, recorta do
 * primeiro `{` ao último `}`.
 */
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'

export const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

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
