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

/** Config avançada do cardio, seja no log, no setDetails[0] ou no próprio exercício. */
function cardioConfig(exercise: Record<string, unknown>, log: Record<string, unknown>): Record<string, unknown> {
  const sd = Array.isArray(exercise.setDetails) && isRec(exercise.setDetails[0]) ? (exercise.setDetails[0] as Record<string, unknown>) : null
  const candidates = [
    log.advanced_config, log.advancedConfig,
    sd?.advanced_config, sd?.advancedConfig,
    exercise.advanced_config, exercise.advancedConfig,
  ]
  for (const c of candidates) if (isRec(c)) return c
  return {}
}

export function getCardioSummary(exercise: unknown, log: unknown): CardioSummary {
  const ex = isRec(exercise) ? exercise : {}
  const lg = isRec(log) ? log : {}
  const cfg = cardioConfig(ex, lg)
  const sd = Array.isArray(ex.setDetails) && isRec(ex.setDetails[0]) ? (ex.setDetails[0] as Record<string, unknown>) : null

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
