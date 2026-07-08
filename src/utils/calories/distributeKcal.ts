/**
 * Distribui as calorias TOTAIS de uma sessão (número canônico do modelo MET) entre
 * os exercícios, de forma que a soma feche EXATAMENTE com o total — sem inventar
 * um cálculo paralelo que se contradiga com o que o app já mostra.
 *
 * Base de rateio (a mais fiel disponível, nesta ordem):
 *  1. Tempo de execução (min) — calorias em treino correlacionam mais com tempo
 *     sob tensão do que com o volume mecânico. Usado quando TODOS os exercícios
 *     têm tempo de execução medido.
 *  2. Volume (peso×reps) — fallback quando o tempo não está disponível pra todos.
 *  3. Igual — último recurso (sem tempo nem volume).
 *
 * Retorna kcal INTEIRO por exercício; o resto do arredondamento é distribuído
 * pras maiores frações, garantindo Σ = round(totalKcal).
 */
export interface ExerciseKcalInput {
  volumeKg?: number | null
  executionMinutes?: number | null
  /** kcal FIXA desta linha (cardio: valor MET exato). Quando presente e > 0, a
   *  linha recebe exatamente este valor e NÃO entra no rateio flexível. */
  fixedKcal?: number | null
}

export function distributeKcalByExercise(exercises: ExerciseKcalInput[], totalKcal: number): number[] {
  const list = Array.isArray(exercises) ? exercises : []
  const n = list.length
  if (n === 0) return []
  const total = Number.isFinite(totalKcal) && totalKcal > 0 ? totalKcal : 0
  if (total <= 0) return list.map(() => 0)

  const times = list.map((e) => (Number.isFinite(Number(e?.executionMinutes)) ? Number(e?.executionMinutes) : 0))
  const vols = list.map((e) => (Number.isFinite(Number(e?.volumeKg)) ? Number(e?.volumeKg) : 0))

  let weights: number[]
  if (times.every((t) => t > 0)) weights = times
  else if (vols.some((v) => v > 0)) weights = vols
  else weights = list.map(() => 1)

  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0) return list.map(() => 0)

  const targetTotal = Math.round(total)
  const raw = weights.map((w) => (targetTotal * w) / sumW)
  const out = raw.map((r) => Math.floor(r))
  let remainder = targetTotal - out.reduce((a, b) => a + b, 0)

  // Distribui o resto (0..n) pras exercícios com maior parte fracionária.
  const byFrac = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < byFrac.length && remainder > 0; k++) {
    out[byFrac[k].i] += 1
    remainder--
  }
  return out
}

/**
 * Como distributeKcalByExercise, mas honra `fixedKcal` por linha: exercícios com
 * kcal fixa (cardio, pelo MET da modalidade) recebem exatamente esse valor; o
 * `flexibleKcal` (a parte de FORÇA) é rateado só entre as linhas sem valor fixo,
 * por tempo/volume. Assim a tabela mostra o cardio certo sem inflar a força.
 *
 * Σ resultado = Σ round(fixedKcal) + round(flexibleKcal em linhas flexíveis).
 */
export function distributeKcalWithFixed(exercises: ExerciseKcalInput[], flexibleKcal: number): number[] {
  const list = Array.isArray(exercises) ? exercises : []
  const n = list.length
  if (n === 0) return []

  const out = new Array<number>(n).fill(0)
  const flexIdx: number[] = []
  list.forEach((e, i) => {
    const f = Number(e?.fixedKcal)
    if (Number.isFinite(f) && f > 0) out[i] = Math.round(f)
    else flexIdx.push(i)
  })

  const flexTotal = Number.isFinite(flexibleKcal) && flexibleKcal > 0 ? Math.round(flexibleKcal) : 0
  if (flexTotal <= 0 || flexIdx.length === 0) return out

  const times = flexIdx.map((i) => (Number.isFinite(Number(list[i]?.executionMinutes)) ? Number(list[i]?.executionMinutes) : 0))
  const vols = flexIdx.map((i) => (Number.isFinite(Number(list[i]?.volumeKg)) ? Number(list[i]?.volumeKg) : 0))

  let weights: number[]
  if (times.every((t) => t > 0)) weights = times
  else if (vols.some((v) => v > 0)) weights = vols
  else weights = flexIdx.map(() => 1)

  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0) return out

  const raw = weights.map((w) => (flexTotal * w) / sumW)
  flexIdx.forEach((idx, k) => { out[idx] = Math.floor(raw[k]) })
  let remainder = flexTotal - flexIdx.reduce((a, idx) => a + out[idx], 0)

  const byFrac = raw
    .map((r, k) => ({ idx: flexIdx[k], frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < byFrac.length && remainder > 0; k++) {
    out[byFrac[k].idx] += 1
    remainder--
  }
  return out
}
