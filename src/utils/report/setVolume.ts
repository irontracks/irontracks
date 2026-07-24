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

/**
 * Estágios de um DROP-SET ou STRIPPING. São mecanicamente idênticos (reduzir a
 * carga em etapas, `stages: [{weight,reps}]`), só mudam a chave onde o saver
 * grava. Ambos precisam somar etapa a etapa — senão o topo (drop-set grava a
 * etapa mais leve × total → subestima; stripping grava a mais pesada × total →
 * superestima) distorce volume e 1RM. Ver auditoria de métodos avançados.
 */
export const getStageArray = (log: Record<string, unknown>): unknown[] | null => {
  const drop = isRec(log.drop_set) ? log.drop_set : null
  if (drop && Array.isArray(drop.stages) && drop.stages.length > 0) return drop.stages
  const strip = isRec(log.stripping) ? log.stripping : null
  if (strip && Array.isArray(strip.stages) && strip.stages.length > 0) return strip.stages
  return null
}

/** Volume de estágios (drop-set/stripping): soma peso×reps de cada etapa. */
export const stagesVolume = (stages: unknown[]): number => {
  let vol = 0
  for (const s of stages) {
    if (!isRec(s)) continue
    const w = parseWeightValue(s.weight)
    const r = parseRepsValue(s.reps)
    if (w > 0 && r > 0) vol += w * r
  }
  return vol
}

/**
 * Volume de um WAVE LOADING (onda). Cada onda tem 3 tiers (pesado/médio/ultra),
 * cada um com peso e reps próprios. Retrocompat: tier sem peso usa o `weight`
 * base do log (modelo antigo, peso único). Volume = Σ ondas Σ tiers (peso×reps).
 */
export const waveVolume = (wave: unknown): number => {
  if (!isRec(wave)) return 0
  const waves = Array.isArray(wave.waves) ? wave.waves : null
  if (!waves || waves.length === 0) return 0
  const base = parseWeightValue(wave.weight)
  const hw = parseWeightValue(wave.heavyWeight) || base
  const mw = parseWeightValue(wave.mediumWeight) || base
  const uw = parseWeightValue(wave.ultraWeight) || base
  let vol = 0
  for (const w of waves) {
    if (!isRec(w)) continue
    vol += hw * parseRepsValue(w.heavy) + mw * parseRepsValue(w.medium) + uw * parseRepsValue(w.ultra)
  }
  return vol
}

/** Volume de UMA série: cluster → estágios (drop/stripping) → wave → unilateral → normal. */
export const setVolume = (log: unknown): number => {
  if (!isRec(log)) return 0
  const cv = clusterVolume(log.cluster)
  if (cv > 0) return cv
  const stages = getStageArray(log)
  if (stages) { const sv = stagesVolume(stages); if (sv > 0) return sv }
  const wv = waveVolume(log.wave)
  if (wv > 0) return wv
  const lv = parseWeightValue(log.L_weight) * parseRepsValue(log.L_reps)
  const rv = parseWeightValue(log.R_weight) * parseRepsValue(log.R_reps)
  if (lv > 0 || rv > 0) return lv + rv
  // Alternado (rosca alternada): 1 registro, mesmo peso, mas OS DOIS lados fazem
  // as reps → o trabalho real é o dobro. O renderer grava `alternating: true` no
  // log da série. Volume = peso × reps × 2.
  const normal = parseWeightValue(log.weight) * parseRepsValue(log.reps)
  return log.alternating === true ? normal * 2 : normal
}

/**
 * Reps TOTAIS de uma série (pra somatório de repetições do relatório).
 *   - unilateral: L_reps + R_reps (antes contava só um lado — corrigido junto);
 *   - alternado: reps × 2 (os dois braços);
 *   - normal: reps.
 * Difere de setTopWeightReps (que devolve as reps de UM lado, pra display/1RM).
 */
export const setTotalReps = (log: unknown): number => {
  if (!isRec(log)) return 0
  const lr = parseRepsValue(log.L_reps)
  const rr = parseRepsValue(log.R_reps)
  if (lr > 0 || rr > 0) return lr + rr
  const r = parseRepsValue(log.reps)
  return log.alternating === true ? r * 2 : r
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
  // dropset/stripping: melhor etapa (o topo grava a etapa mais leve/pesada × total
  // de reps → enganoso nos dois). Mesma estrutura `stages: [{weight,reps}]`.
  const stages = getStageArray(log)
  if (stages && stages.length > 0) {
    for (const s of stages) if (isRec(s)) bump(parseWeightValue(s.weight), parseRepsValue(s.reps))
    if (best > 0) return best
  }
  // wave: melhor tier (peso próprio × reps), retrocompat com peso base único
  const wave = isRec(log.wave) ? log.wave : null
  const waveList = wave && Array.isArray(wave.waves) ? wave.waves : null
  if (waveList && waveList.length > 0) {
    const base = parseWeightValue(wave!.weight)
    const hw = parseWeightValue(wave!.heavyWeight) || base
    const mw = parseWeightValue(wave!.mediumWeight) || base
    const uw = parseWeightValue(wave!.ultraWeight) || base
    for (const w of waveList) if (isRec(w)) {
      bump(hw, parseRepsValue(w.heavy)); bump(mw, parseRepsValue(w.medium)); bump(uw, parseRepsValue(w.ultra))
    }
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
