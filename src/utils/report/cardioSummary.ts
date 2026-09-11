/**
 * Resumo de um exercício de CARDIO para o relatório.
 *
 * Cardio (esteira, bike, escada…) não tem carga/reps/1RM — mostrar a tabela de
 * musculação nele produzia lixo: "Cad: 2020", "1RM est: —", "Reps: 20" (o 20 era
 * o TEMPO em minutos, não repetições). Este helper extrai os campos que fazem
 * sentido pra cardio, dos dois formatos de dado:
 *   - moderno (CardioSetInput): log.durationSeconds / log.speed / log.incline
 *   - legado: reps = minutos, config em setDetails[0].advanced_config
 *
 * Fonte única usada pelo card React e pelo gerador de PDF (buildHtml).
 */
import { isCardioExercise } from '@/utils/exercise/isCardio'

export { isCardioExercise }

export interface CardioSummary {
  timeMin: number | null
  speedKmh: string | null
  inclinePct: string | null
  resistance: string | null
  heartRate: string | null
  isHIT: boolean
  hitWorkSec: number | null
  hitRestSec: number | null
  hitRounds: number | null
}

const isRec = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const posNum = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(',', '.').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

const nonEmpty = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/** O bloco planejado de índice `i` — cada bloco tem o SEU, não o do primeiro. */
function planejado(exercise: Record<string, unknown>, i: number): Record<string, unknown> | null {
  const arr = Array.isArray(exercise.setDetails) ? exercise.setDetails : null
  return arr && isRec(arr[i]) ? (arr[i] as Record<string, unknown>) : null
}

/** Config avançada do cardio, seja no log, no bloco planejado ou no exercício. */
function cardioConfig(exercise: Record<string, unknown>, log: Record<string, unknown>, i = 0): Record<string, unknown> {
  const sd = planejado(exercise, i)
  const candidates = [
    log.advanced_config, log.advancedConfig,
    sd?.advanced_config, sd?.advancedConfig,
    exercise.advanced_config, exercise.advancedConfig,
  ]
  for (const c of candidates) if (isRec(c)) return c
  return {}
}

/**
 * @param blocoIdx qual bloco planejado consultar quando o log não traz o campo.
 *   ⚠️ Era fixo em 0. Num cardio de vários blocos isso fazia o bloco 3 sem log
 *   exibir a velocidade PLANEJADA do bloco 1 — dado de outro bloco com cara de
 *   medição. Achado ao escrever o guard de 11/09/2026.
 */
export function getCardioSummary(exercise: unknown, log: unknown, blocoIdx = 0): CardioSummary {
  const ex = isRec(exercise) ? exercise : {}
  const lg = isRec(log) ? log : {}
  const cfg = cardioConfig(ex, lg, blocoIdx)
  const sd = planejado(ex, blocoIdx)

  // Tempo: durationSeconds (moderno) → minutos; senão reps (legado grava minutos ali).
  const durSec = posNum(lg.durationSeconds) ?? posNum(sd?.durationSeconds)
  const timeMin = durSec != null
    ? Math.round((durSec / 60) * 10) / 10
    : (posNum(lg.reps) ?? posNum(ex.reps))

  const isHIT = cfg.isHIT === true || cfg.isHIT === 'true'

  return {
    timeMin,
    speedKmh: nonEmpty(lg.speed) ?? nonEmpty(cfg.speed),
    inclinePct: nonEmpty(lg.incline) ?? nonEmpty(cfg.incline),
    resistance: nonEmpty(cfg.resistance),
    heartRate: nonEmpty(lg.heart_rate) ?? nonEmpty(cfg.heart_rate),
    isHIT,
    hitWorkSec: isHIT ? posNum(cfg.workSec) : null,
    hitRestSec: isHIT ? posNum(cfg.restSec) : null,
    hitRounds: isHIT ? posNum(cfg.rounds) : null,
  }
}

/**
 * TODOS os blocos de um cardio, na ordem em que foram executados.
 *
 * ⚠️ Existe porque o relatório mostrava só o PRIMEIRO. Até 11/09/2026, o card
 * React e o PDF faziam a mesma coisa — varrer os logs e `break` no primeiro com
 * dado. Com um bloco só isso estava certo; desde que a esteira passou a ter
 * BLOCOS (#1063), virou perda de dado na tela.
 *
 * Medido na sessão do dono de 11/09/2026: três blocos gravados corretamente no
 * banco (5 min @ 4 km/h · 10 min @ 5 · 15 min @ 6 com 6% de inclinação) e o
 * relatório exibindo apenas `5 min · 4 km/h · 0%`. O dado nunca se perdeu — só
 * dois terços dele nunca chegaram aos olhos de ninguém.
 *
 * Fonte única: card React e PDF consomem esta função, não a varredura própria.
 */
export function getCardioSummaries(
  exercise: unknown,
  logsPorBloco: readonly unknown[],
): CardioSummary[] {
  const temAlgo = (s: CardioSummary) =>
    s.timeMin != null || !!s.speedKmh || !!s.inclinePct || !!s.resistance || !!s.heartRate || s.isHIT

  const blocos = logsPorBloco
    .map((lg, i) => (isRec(lg) ? getCardioSummary(exercise, lg, i) : null))
    .filter((b): b is CardioSummary => b !== null)
    .filter(temAlgo)

  // Sem nenhum log com dado, cai no resumo do próprio exercício (planejado ou
  // legado) — é o que o relatório sempre mostrou e não pode regredir.
  if (blocos.length) return blocos
  const doExercicio = getCardioSummary(exercise, null)
  return temAlgo(doExercicio) ? [doExercicio] : []
}

/** Soma dos minutos dos blocos — o "tempo total" quando há mais de um. */
export function totalMinutosDeCardio(blocos: readonly CardioSummary[]): number | null {
  const soma = blocos.reduce((acc, b) => acc + (b.timeMin ?? 0), 0)
  return soma > 0 ? Math.round(soma * 10) / 10 : null
}
