/**
 * Regras do método Rest-Pause / SST.
 *
 * Rest-Pause é uma série de ativação levada perto da falha, seguida de PAUSAS
 * CURTAS e mini-séries com a mesma carga. Com uma única mini-série o método deixa
 * de existir: vira uma série normal com uma pausa no meio. Por isso o piso é 2 —
 * não é preferência de UI, é a definição do método.
 *
 * Existe porque o app deixava o plano cair para 1 (relatado pelo dono em 03/08/2026,
 * com print: "1 minis • descanso 15s ... não tem como fazer rest-p com 1 mini set").
 * A causa está em `useWorkoutMethodSavers`: `planned_mini_sets` era gravado como
 * `miniReps.length`, ou seja, o que foi PREENCHIDO sobrescrevia o que foi PLANEJADO.
 * Registrar um dia incompleto rebaixava o plano do exercício para sempre, e a
 * abertura seguinte já mostrava o número errado.
 */

/** Mínimo de mini-séries para o método fazer sentido. */
export const MIN_MINI_SETS = 2

/** Quantidade usada quando o exercício não traz configuração nenhuma. */
export const DEFAULT_MINI_SETS = 2

/**
 * Normaliza uma quantidade de mini-séries para um valor válido.
 * Qualquer coisa abaixo do piso (inclusive lixo, 0 ou negativo) vira `MIN_MINI_SETS`.
 */
export function normalizeMiniSets(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < MIN_MINI_SETS) return MIN_MINI_SETS
  return n
}

/**
 * Quantas mini-séries o PLANO deve guardar depois de um registro.
 *
 * `planned` é o que o treino previa; `filled` é quantas o usuário preencheu hoje.
 * O plano nunca é rebaixado por um registro incompleto — só cresce, quando a pessoa
 * de fato gerou e preencheu mais minis do que o previsto.
 */
export function resolvePlannedMiniSets(planned: unknown, filled: unknown): number {
  const p = normalizeMiniSets(planned)
  const f = Math.floor(Number(filled))
  if (!Number.isFinite(f) || f <= p) return p
  return f
}
