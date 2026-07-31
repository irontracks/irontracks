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

/** Resumo da descarga a partir do mapa de logs ("exIdx-setIdx" → log). */
export const detectSessionDeload = (logs: unknown): SessionDeload => {
  if (!isRec(logs)) return VAZIO
  const idxs = new Set<number>()
  let setsCount = 0
  let somaReducao = 0
  for (const [key, log] of Object.entries(logs)) {
    if (!isRec(log) || !isRec(log.deload)) continue
    const d = log.deload
    // A redução pode vir pronta (`reductionPct`) ou ser derivada dos pesos.
    const pct = (() => {
      const direto = num(d.reductionPct)
      if (direto > 0 && direto < 1) return direto
      const de = num(d.originalWeight)
      const para = num(d.suggestedWeight)
      if (de > 0 && para > 0 && para < de) return 1 - para / de
      return 0
    })()
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
