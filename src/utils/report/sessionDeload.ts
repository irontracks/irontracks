/**
 * Sessão de DESCARGA (deload) — detectada a partir dos próprios logs.
 *
 * Quando o deload é aplicado, cada série recebe `log.deload = { originalWeight,
 * suggestedWeight, reductionPct, … }` (ver `buildDeloadPatches`). Este módulo lê
 * essa marca e resume a sessão inteira.
 *
 * É DERIVADO de propósito, não um flag à parte gravado em paralelo: um marcador
 * separado pode dessincronizar dos logs (foi assim que `reportMeta.totals
 * .volumeKg` e `ai.metrics.totalVolumeKg` passaram meses divergindo na mesma
 * sessão). A marca por série é a fonte; tudo mais se deriva dela.
 *
 * Para que serve: uma sessão de descarga tem, por construção, 15–22 % menos
 * carga que as anteriores. Sem saber disso, o resto do app lê essa queda como
 * piora — `buildTrainingLoadFlags` marca `isBadDay` (dispara em −10 %), o
 * relatório mostra Δ volume negativo e o Coach IA escreve que o aluno regrediu,
 * justamente quando ele fez o que o app mandou.
 */

const isRec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export type SessionDeload = {
  /** Houve ao menos uma série com deload aplicado. */
  applied: boolean
  /** Quantas séries receberam redução. */
  setsCount: number
  /** Índices (0-based) dos exercícios afetados. */
  exerciseIdxs: number[]
  /** Redução média efetiva (0–1) entre as séries marcadas. */
  avgReductionPct: number
}

const VAZIO: SessionDeload = { applied: false, setsCount: 0, exerciseIdxs: [], avgReductionPct: 0 }

/**
 * FONTE ÚNICA: quanto esta marca de deload REDUZIU de fato (0–1). Zero quando
 * não reduziu nada.
 *
 * Virou função exportada porque a mesma pergunta era feita em DUAS pontas, e as
 * duas erravam igual — bastava o objeto `deload` existir:
 *
 *  - aqui, em `detectSessionDeload` (corrigido em #1097);
 *  - em `useWorkoutDeload`, no `hadDeload` que monta o `reportHistory`
 *    (`if (isObject(log.deload)) hadDeload = true`) — e é ESSA que faz
 *    `pickUsableHistory` descartar a sessão do motor de carga.
 *
 * A segunda é a que dói. Uma série marcada como descarga mas treinada em carga
 * CHEIA (07/09/2026: pullover 35 → 35 kg anunciando 30 %) sumia do histórico do
 * motor, que perdia justamente o melhor sinal para calcular a próxima carga.
 */
export const deloadReductionPct = (deload: unknown): number => {
  if (!isRec(deload)) return 0
  // Os PESOS decidem; `reductionPct` é só o plano. O piso do exercício e a grade
  // montável da máquina limitam a descida, e o percentual seguia sendo o teórico.
  const de = num(deload.originalWeight)
  const para = num(deload.suggestedWeight)
  if (de > 0 && para > 0) return para < de ? 1 - para / de : 0
  const direto = num(deload.reductionPct)
  if (direto > 0 && direto < 1) return direto
  return 0
}

/** Esta marca de deload representa uma descarga REAL? */
export const isRealDeload = (deload: unknown): boolean => deloadReductionPct(deload) > 0

/** Resumo da descarga a partir do mapa de logs ("exIdx-setIdx" → log). */
export const detectSessionDeload = (logs: unknown): SessionDeload => {
  if (!isRec(logs)) return VAZIO
  const idxs = new Set<number>()
  let setsCount = 0
  let somaReducao = 0
  for (const [key, log] of Object.entries(logs)) {
    if (!isRec(log) || !isRec(log.deload)) continue
    const pct = deloadReductionPct(log.deload)
    if (pct <= 0) continue
    setsCount += 1
    somaReducao += pct
    const eIdx = Number(String(key).split('-')[0])
    if (Number.isFinite(eIdx)) idxs.add(eIdx)
  }
  if (setsCount === 0) return VAZIO
  return {
    applied: true,
    setsCount,
    exerciseIdxs: [...idxs].sort((a, b) => a - b),
    avgReductionPct: Math.round((somaReducao / setsCount) * 1000) / 1000,
  }
}

/** Atalho: a sessão (objeto do `workouts.notes`) é uma sessão de descarga? */
export const isDeloadSession = (session: unknown): boolean => {
  if (!isRec(session)) return false
  return detectSessionDeload(session.logs).applied
}
