/**
 * machineGrid — aprende os pesos que a MÁQUINA REAL oferece, a partir do que o
 * usuário já registrou naquele exercício.
 *
 * O PROBLEMA (dono, 03/08/2026): "máquina que tem 84kg e o sistema pede 85, porém a
 * máquina não tem". `plateMath` assume que máquina/cabo andam de 5 em 5 kg — um
 * default razoável que é falso em boa parte dos aparelhos.
 *
 * Confirmado nos dados de produção. A "Mesa flexora" deste usuário registra
 * 18, 23, 27, 32, 36, 41, 45, 50, 54, 59, 63 — diferenças alternando 5, 4, 5, 4…
 * Isso é um stack em LIBRAS: 10 lb = 4,536 kg, que arredondado dá exatamente essa
 * sequência. O motor, andando de 5 em 5, sugeria 20, 25, 30, 35, 40 — cinco valores
 * que aquela máquina não tem. O usuário então corrige na mão toda vez, e o motor
 * nunca aprende.
 *
 * A ABORDAGEM: não tentamos inferir o modelo físico do aparelho (stack em lb? placa
 * base + add-on?). Tentar adivinhar isso quebra com ruído — e há ruído de sobra:
 * a "Cadeira extensora" do mesmo usuário mistura duas academias, com 50/77/104 muito
 * frequentes e uma nuvem de valores intermediários. Em vez disso, tratamos os pesos
 * JÁ REGISTRADOS como a verdade sobre o que é montável: se ele levantou 84 ali, 84
 * existe. É auto-corrigível (quanto mais treina, melhor fica) e nunca inventa um
 * valor que ninguém viu.
 *
 * Puro/client-safe, sem I/O — o histórico já vem carregado no `reportHistory`.
 */

/** Peso mínimo plausível num registro de carga; abaixo disso é ruído de digitação. */
const MIN_PLAUSIBLE_KG = 0.5

/**
 * Mínimo de valores distintos para confiar no grid. Com menos que isso não há
 * sequência: dois pontos definem qualquer passo, e o snap viraria chute.
 */
const MIN_DISTINCT_VALUES = 4

/**
 * Folga sobre o passo aprendido ao aceitar um snap. 1,1 cobre o arredondamento que o
 * próprio usuário faz ao digitar (4,536 kg vira ora 4, ora 5).
 */
const SNAP_TOLERANCE_FACTOR = 1.1

export interface WeightGrid {
  /** Pesos distintos observados, em ordem crescente. */
  values: number[]
  /** Passo típico (mediana das diferenças entre valores consecutivos). */
  step: number
  /** Quantos registros embasaram o grid — usado para decidir confiança. */
  samples: number
}

const isPlausible = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_PLAUSIBLE_KG

/** Mediana — resistente aos saltos que aparecem quando o usuário pula degraus. */
const median = (nums: number[]): number => {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Aprende o grid a partir dos pesos já registrados no exercício.
 * Devolve null quando não há evidência suficiente — e aí o chamador segue com o
 * `plateMath`, que é o comportamento atual.
 */
export function learnWeightGrid(weights: readonly unknown[] | null | undefined): WeightGrid | null {
  const list = (Array.isArray(weights) ? weights : [])
    .map((w) => Number(w))
    .filter(isPlausible)
  if (list.length === 0) return null

  // Arredonda a 0,5 kg antes de deduplicar: 22,5 e 22,50 são o mesmo furo do pino.
  const values = [...new Set(list.map((w) => Math.round(w * 2) / 2))].sort((a, b) => a - b)
  if (values.length < MIN_DISTINCT_VALUES) return null

  const gaps: number[] = []
  for (let i = 1; i < values.length; i++) {
    const gap = values[i] - values[i - 1]
    if (gap > 0) gaps.push(gap)
  }
  if (!gaps.length) return null

  const step = median(gaps)
  if (!Number.isFinite(step) || step <= 0) return null

  return { values, step, samples: list.length }
}

/**
 * Ajusta um peso-alvo para um valor que a máquina realmente tem.
 *
 * Mantém o viés de segurança do motor: escolhe sempre o degrau IGUAL OU ABAIXO do
 * alvo — nunca empurra mais peso do que a conta pediu.
 *
 * Devolve null quando não dá para responder com honestidade, e nesses casos o
 * chamador deve seguir com o arredondamento por equipamento:
 *  - sem grid confiável;
 *  - alvo abaixo do menor peso já visto (não sabemos o que existe lá embaixo);
 *  - o degrau mais próximo está longe demais (buraco no histórico). Sem esta guarda,
 *    um alvo de 60 kg com observações [50, 77] cairia para 50 — uma regressão de 17%
 *    inventada por falta de dado, não por decisão do motor.
 */
export function snapToLearnedGrid(target: number, grid: WeightGrid | null | undefined): number | null {
  if (!grid || !Number.isFinite(target) || target <= 0) return null
  const { values, step } = grid
  if (!values.length) return null

  const max = values[values.length - 1]

  // Acima de tudo que já foi visto: progressão para território novo. Extrapola pelo
  // passo aprendido, em vez de devolver o teto e travar a evolução do aluno.
  if (target > max) {
    const stepsUp = Math.floor((target - max) / step)
    const extrapolated = max + stepsUp * step
    return Math.round(extrapolated * 2) / 2
  }

  // Maior degrau conhecido que não passa do alvo.
  let candidate: number | null = null
  for (const v of values) {
    if (v <= target + 1e-9) candidate = v
    else break
  }
  if (candidate === null) return null // alvo abaixo do menor peso conhecido

  return target - candidate <= step * SNAP_TOLERANCE_FACTOR ? candidate : null
}
