/**
 * @module sessionWorkoutIdentity
 *
 * QUAL TREINO é esta sessão do histórico — a pergunta que `buildTrainingLoadFlags`
 * não fazia e que produziu falso positivo de "dia ruim" (18/09/2026).
 *
 * A comparação de carga do dia só significa alguma coisa contra o MESMO treino:
 * Upper A, Lower B e Pump têm grupos musculares e volumes estruturalmente
 * diferentes, e misturá-los na mesma média faz o app acusar queda de 20 % num
 * dia em que todos os exercícios progrediram.
 *
 * **A identidade é o `originWorkoutId`, não o nome.** Medido na conta do dono
 * (120 dias): o MESMO treino aparece com 3 a 4 nomes diferentes — "SEG · Upper
 * B - Peito + Braços", "SEX · Upper B - Peito + Braços", "Treino 4 · Upper B -
 * Peito + Braços" — porque o prefixo do dia é reescrito quando a semana é
 * reorganizada (`formatWeekdayWorkoutTitle`). O id agrupou 15, 14, 13, 10 e 10
 * sessões; o nome teria fatiado cada split em três.
 *
 * O NOME segue como segunda chave porque o id nem sempre está lá: 9 das 155
 * sessões da conta do dono são de antes de o payload gravar `originWorkoutId`.
 * Por isso a comparação é `mesmoTreinoDaSessao(a, b)` e não "igualdade de
 * chave": quando um dos dois lados não tem id, o nome decide; quando os dois
 * têm, o id manda e o nome não é consultado (renomear um treino não pode
 * quebrar a série histórica dele).
 */
import { resolveWorkoutKey } from '@/lib/workout/workoutKey'
import { normalizeExerciseKey } from '@/utils/report/formatters'

const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** Id do treino de origem da sessão, ou string vazia. */
export const sessionWorkoutId = (session: unknown): string => {
  const s = rec(session)
  if (!s) return ''
  return texto(s.originWorkoutId) || texto(s.origin_workout_id) || texto(rec(s.workout)?.id)
}

/**
 * Nome normalizado do treino da sessão, ou string vazia.
 *
 * `resolveWorkoutKey` é a fonte única da chave por nome no app (motor de carga,
 * descarga), mas ela lê `title`/`name` — e o payload do finish grava o título em
 * `workoutTitle`. Daí o complemento, sem tocar naquele módulo.
 */
export const sessionWorkoutName = (session: unknown): string => {
  const porChaveDoApp = resolveWorkoutKey(null, session)
  if (porChaveDoApp) return porChaveDoApp
  const s = rec(session)
  return s ? normalizeExerciseKey(texto(s.workoutTitle)) : ''
}

/** As duas sessões são do mesmo treino? */
export const mesmoTreinoDaSessao = (a: unknown, b: unknown): boolean => {
  const idA = sessionWorkoutId(a)
  const idB = sessionWorkoutId(b)
  if (idA && idB) return idA === idB
  const nomeA = sessionWorkoutName(a)
  const nomeB = sessionWorkoutName(b)
  return Boolean(nomeA) && nomeA === nomeB
}
