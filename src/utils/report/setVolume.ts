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

/**
 * True se a série CONTA para estatísticas: foi feita (done) E não é aquecimento
 * nem feeler. Mesma regra do relatório de finalização (reportMetrics), pra o card
 * "Resumo" do histórico não superestimar o volume contando aquecimento.
 */
export const isWorkingSet = (log: unknown): boolean => {
  if (!isRec(log)) return false
  const doneRaw = log.done ?? log.isDone ?? log.completed ?? null
  const done = doneRaw == null ? true : doneRaw === true || String(doneRaw ?? '').toLowerCase() === 'true'
  if (!done) return false
  const rawType = log.set_type ?? log.setType
  if (rawType === 'warmup' || rawType === 'feeler') return false
  if (!rawType && (log.is_warmup || log.isWarmup)) return false
  return true
}

/** Epley 1RM: peso × (1 + reps/30). 1 rep = o próprio peso. 0 se inválido. */
export const epley1rm = (weight: number, reps: number): number => {
  if (!(weight > 0) || !(reps > 0)) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

/**
 * Melhor 1RM estimado de UMA série (Epley), tratando os formatos especiais:
 *   - dropset: melhor etapa (stages)
 *   - cluster: melhor bloco (blocksDetailed, com o peso próprio de cada bloco)
 *   - unilateral: o lado com carga (setTopWeightReps)
 *   - normal: weight/reps do topo
 *
 * Fonte ÚNICA usada pelo relatório (dia) E pelo baseline histórico
 * (getHistoricalBestE1rm), pra o Δ1RM comparar maçãs com maçãs — sem isso, cada
 * lado usava uma regra e o Δ ficava falso (dropset, unilateral, singles).
 */
export const setBestE1rm = (log: unknown): number => {
  if (!isRec(log)) return 0
  let best = 0
  const bump = (w: number, r: number) => { const e = epley1rm(w, r); if (e > best) best = e }
  // dropset: melhor etapa (o topo grava a etapa mais leve × total de reps → enganoso)
  const drop = isRec(log.drop_set) ? log.drop_set : null
  const stages = drop && Array.isArray(drop.stages) ? drop.stages : null
  if (stages && stages.length > 0) {
    for (const s of stages) if (isRec(s)) bump(parseWeightValue(s.weight), parseRepsValue(s.reps))
    if (best > 0) return best
  }
  // cluster: melhor bloco (blocksDetailed tem o peso próprio de cada bloco)
  const cl = isRec(log.cluster) ? log.cluster : null
  const blocks = cl
    ? (Array.isArray(cl.blocksDetailed) ? cl.blocksDetailed : Array.isArray(cl.blocks) ? cl.blocks : null)
    : null
  if (blocks && blocks.length > 0) {
    for (const b of blocks) if (isRec(b)) bump(parseWeightValue(b.weight), parseRepsValue(b.reps))
    if (best > 0) return best
  }
  // unilateral / normal
  const { weight, reps } = setTopWeightReps(log)
  bump(weight, reps)
  return best
}
