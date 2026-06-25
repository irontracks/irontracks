/**
 * Fonte ÚNICA de extração de peso/reps/volume de uma série logada.
 *
 * Trata os três formatos de série:
 *   - cluster: volume vem dos blocks (cada um com peso×reps próprio)
 *   - unilateral: valores em L_weight/R_weight/L_reps/R_reps (somados L+R)
 *   - normal: weight/reps no topo do log
 *
 * Sem isso, exercícios UNILATERAIS (que salvam só em L_/R_) contavam volume 0
 * e sumiam do histórico, do resumo de finalização e da detecção de PR.
 */

const isRec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Peso (kg) — trata vírgula decimal. 0 se inválido/ausente. */
export const parseWeightValue = (raw: unknown): number => {
  const s = String(raw ?? '').replace(',', '.').trim()
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Reps — trata vírgula e formato "feito/planejado" ("8/10" → 8). */
export const parseRepsValue = (raw: unknown): number => {
  const s = String(raw ?? '').replace(',', '.').trim()
  if (!s) return 0
  if (s.includes('/')) {
    const n = Number(s.split('/')[0].trim())
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Volume de um cluster (cada block tem peso×reps). */
export const clusterVolume = (cluster: unknown): number => {
  if (!isRec(cluster)) return 0
  const src = Array.isArray(cluster.blocksDetailed)
    ? cluster.blocksDetailed
    : Array.isArray(cluster.blocks)
      ? cluster.blocks
      : null
  if (!src || src.length === 0) return 0
  let vol = 0
  for (const block of src) {
    if (!isRec(block)) continue
    const w = parseWeightValue(block.weight)
    const r = parseRepsValue(block.reps)
    if (w > 0 && r > 0) vol += w * r
  }
  return vol
}

/** Volume de UMA série: cluster → unilateral (L+R) → normal (peso×reps). */
export const setVolume = (log: unknown): number => {
  if (!isRec(log)) return 0
  const cv = clusterVolume(log.cluster)
  if (cv > 0) return cv
  const lv = parseWeightValue(log.L_weight) * parseRepsValue(log.L_reps)
  const rv = parseWeightValue(log.R_weight) * parseRepsValue(log.R_reps)
  if (lv > 0 || rv > 0) return lv + rv
  return parseWeightValue(log.weight) * parseRepsValue(log.reps)
}

/**
 * Peso/reps "principais" de uma série, p/ exibição e detecção de PR.
 * Unilateral: pega o lado que tiver valor (L primeiro). Normal: weight/reps.
 */
export const setTopWeightReps = (log: unknown): { weight: number; reps: number } => {
  if (!isRec(log)) return { weight: 0, reps: 0 }
  const weight = parseWeightValue(log.weight) || parseWeightValue(log.L_weight) || parseWeightValue(log.R_weight)
  const reps = parseRepsValue(log.reps) || parseRepsValue(log.L_reps) || parseRepsValue(log.R_reps)
  return { weight, reps }
}
