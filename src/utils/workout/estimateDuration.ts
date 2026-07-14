// Estimativa leve de duração e volume de séries de um treino, a partir dos
// exercícios já hidratados (mapWorkoutRow) — sem query nova. É um HINT ("~X min"),
// não um cronômetro: tempo de execução por série + descanso configurado.

interface ExerciseLike {
  sets?: number | null
  restTime?: number | null
  setDetails?: unknown[] | null
  method?: string | null
}

const WORK_SEC_PER_SET = 40 // execução média de uma série
const DEFAULT_REST_SEC = 60 // fallback quando o exercício não tem descanso definido
const CARDIO_MIN_DEFAULT = 20 // cardio sem séries → bloco fixo estimado

const setsOf = (e: ExerciseLike): number =>
  Math.max(0, Math.floor(Number(e?.setDetails?.length) || Number(e?.sets) || 0))

/** Total de séries somando todos os exercícios. */
export function countTotalSets(exercises: unknown): number {
  if (!Array.isArray(exercises)) return 0
  return exercises.reduce((acc: number, e) => acc + setsOf(e as ExerciseLike), 0)
}

/** Duração estimada em minutos (>=1 quando há exercícios; 0 se vazio). */
export function estimateWorkoutMinutes(exercises: unknown): number {
  if (!Array.isArray(exercises) || exercises.length === 0) return 0
  let seconds = 0
  for (const raw of exercises) {
    const e = raw as ExerciseLike
    if (String(e?.method || '').toLowerCase() === 'cardio') {
      seconds += CARDIO_MIN_DEFAULT * 60
      continue
    }
    const sets = Math.max(1, setsOf(e))
    const rest = Number(e?.restTime)
    const restSec = Number.isFinite(rest) && rest > 0 ? rest : DEFAULT_REST_SEC
    seconds += sets * (WORK_SEC_PER_SET + restSec)
  }
  return Math.max(1, Math.round(seconds / 60))
}
