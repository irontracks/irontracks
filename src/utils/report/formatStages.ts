import { getStageArray, parseWeightValue, parseRepsValue } from './setVolume'

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

export interface SetStagesDisplay {
  /** Pesos das etapas: "57 → 36" */
  weights: string
  /** Reps das etapas: "12 → 18" */
  reps: string
  /** Quantidade de etapas */
  count: number
}

/**
 * Etapas de um drop-set/stripping prontas para exibição.
 *
 * Por que existe: o saver grava no TOPO do log apenas a ÚLTIMA etapa (o peso mais
 * leve) e a SOMA das reps — as etapas reais ficam em `drop_set.stages` /
 * `stripping.stages`. O relatório lia só o topo e escondia o drop inteiro: quem
 * fez "57kg → 36kg" via apenas "36 kg / 30 reps". Aqui recuperamos as etapas.
 *
 * Retorna null para séries normais (sem etapas) ou com uma etapa só.
 */
export function formatSetStages(log: unknown): SetStagesDisplay | null {
  if (!isRec(log)) return null
  const stages = getStageArray(log)
  if (!stages || stages.length < 2) return null

  const weights: string[] = []
  const reps: string[] = []
  for (const s of stages) {
    if (!isRec(s)) continue
    const w = parseWeightValue(s.weight)
    const r = parseRepsValue(s.reps)
    weights.push(w > 0 ? String(w) : '—')
    reps.push(r > 0 ? String(r) : '—')
  }
  if (weights.length < 2) return null

  return {
    weights: weights.join(' → '),
    reps: reps.join(' → '),
    count: weights.length,
  }
}
