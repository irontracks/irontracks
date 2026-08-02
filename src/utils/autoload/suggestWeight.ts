/**
 * suggestWeight — núcleo do motor de auto-regulação de carga (Fase 1).
 *
 * Dado o histórico da última sessão de um exercício + o alvo da série (reps/RPE) +
 * o equipamento + a prontidão de hoje, devolve o peso sugerido para a série atual.
 *
 * Princípio (autorregulação por RPE/e1RM):
 *  1. Estima o 1RM (e1RM) a partir da melhor série da última sessão, via Epley
 *     ajustado por RPE (reps na reserva = 10 - RPE).
 *  2. Inverte Epley para o alvo (reps @ RPE) → peso teórico.
 *  3. Dupla progressão / trava anti-regressão: não recua num dia normal, e limita
 *     o salto por sessão (segurança).
 *  4. Modula pela prontidão do dia — SÓ amortece (dia ruim pega mais leve), nunca
 *     empurra mais peso (viés de segurança).
 *  5. Arredonda pro incremento montável do equipamento (plateMath), pra baixo.
 *
 * Função PURA e determinística — a origem dos dados (histórico do exercício, do
 * substituto, check-in de hoje) é resolvida na camada de fiação; aqui só a matemática.
 */

import { resolveIncrement, roundToIncrement } from './plateMath'

export interface HistorySet {
  weight: number
  reps: number
  /** RPE 0-10; null quando não informado. */
  rpe: number | null
  /** true se a série foi levada à falha muscular. */
  failed?: boolean
}

export interface ReadinessToday {
  /** horas de sono na última noite. */
  sleepHours?: number | null
  /** dor muscular 0-10 (antes de treinar). */
  soreness?: number | null
  /** energia 1-5 (derivada do humor). */
  energy?: number | null
}

export interface SuggestInput {
  /** Séries de trabalho da ÚLTIMA sessão deste exercício (ou de um substituto). */
  history: HistorySet[]
  /** Reps-alvo da série atual (topo da faixa, se faixa). */
  targetReps: number
  /** RPE-alvo da série (default 8 ≈ 2 reps na reserva). */
  targetRpe?: number | null
  /** equipment[] do exercício (para arredondar). */
  equipment?: readonly string[] | null
  /** Prontidão de hoje (check-in pré-treino). */
  readiness?: ReadinessToday
  /**
   * true quando o histórico veio de um exercício SUBSTITUTO (cold-start), não do
   * próprio exercício — reduz a confiança e é mais conservador.
   */
  fromSubstitute?: boolean
  /**
   * SÉRIE DE RECONHECIMENTO de HOJE, já concluída, deste mesmo exercício.
   *
   * É a única medida do dia que o motor tem: o histórico diz o que você conseguiu
   * na última sessão, isto diz como você está agora. Quando presente e confiável,
   * substitui a projeção do histórico (e resolve o cold-start: exercício inédito
   * passa a ter sugestão, em vez do "faça a 1ª série pra calibrar" que o motor
   * escrevia sem nunca cumprir).
   *
   * Opt-in DUPLO, por decisão do dono: só chega aqui quando o usuário marcou a
   * série como "Reconhecimento" E preencheu o RPE. Sem RPE não há como estimar
   * esforço, e a literatura mostra que RPE autorreportado longe da falha é
   * impreciso — então exigir o preenchimento é o que mantém o sinal utilizável.
   */
  todaySignal?: HistorySet | null
  /**
   * Deload LIGADO neste exercício? Toggle por-exercício (o botão do card de treino).
   *
   * `false` = deload DESLIGADO: o motor nunca REDUZ a carga — o piso vira sempre o
   * topWeight (maior carga da última sessão utilizável), independentemente de
   * prontidão ruim ou de sinal do dia apontando pra baixo. Progressão (subir) segue
   * livre. `true`/undefined = comportamento normal (pode amortecer em dia ruim).
   *
   * Substitui o antigo modal manual de deload: em vez de recalcular/aplicar uma
   * redução pontual, o usuário decide por exercício se o motor novo pode reduzir.
   */
  deloadEnabled?: boolean
}

/**
 * Faixa em que o sinal do dia pode mexer na carga. Força não varia 30% entre duas
 * sessões: se a conta deu isso, o erro está na estimativa (RPE mal reportado), não
 * no atleta. Amortece mais do que empurra, mesmo viés de segurança da prontidão.
 */
const DAY_FACTOR_MIN = 0.9
const DAY_FACTOR_MAX = 1.05
/**
 * Acima deste RIR o RPE relatado é notoriamente impreciso (o erro cresce quanto
 * mais longe da falha). Nessa faixa o sinal só pode AMORTECER, nunca subir carga.
 */
const UNRELIABLE_RIR = 4

export interface WeightSuggestion {
  /** Peso sugerido em kg, ou null quando não há base / equipamento não é de carga. */
  weight: number | null
  /** Reps sugeridas (o alvo). */
  reps: number | null
  /** Confiança da sugestão. */
  confidence: 'high' | 'medium' | 'low'
  /** Explicação curta, estilo personal ("Semana passada 80×8 @7 → subi p/ 82,5"). */
  rationale: string
}

const DEFAULT_TARGET_RPE = 8
/** Salto máximo de carga por sessão vs. melhor série anterior (segurança). */
const MAX_SESSION_INCREASE = 0.1
/** Piso da modulação de prontidão (só amortece). */
const MIN_READINESS_FACTOR = 0.88

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clampRpe = (rpe: number): number => Math.min(10, Math.max(1, rpe))
const fmtKg = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))

/**
 * e1RM via Epley ajustado por RPE. Reps efetivas = reps reais + reps na reserva (10-RPE),
 * então a carga leve feita "sobrando" projeta um 1RM maior do que se fosse à falha.
 * Sem RPE, assume a série como quase-máxima (RIR 1) pra não superestimar.
 */
export function estimateE1RM(set: HistorySet): number | null {
  if (!isFiniteNum(set.weight) || set.weight <= 0) return null
  if (!isFiniteNum(set.reps) || set.reps <= 0) return null
  const rir = isFiniteNum(set.rpe) ? Math.max(0, 10 - clampRpe(set.rpe)) : 1
  const effectiveReps = set.reps + rir
  return set.weight * (1 + effectiveReps / 30)
}

/**
 * Só aceita o sinal do dia quando ele é aproveitável: peso e reps positivos E RPE
 * informado. Sem RPE não há como estimar o esforço, e chutar aqui contaminaria a
 * carga das séries de trabalho — melhor ignorar e cair no comportamento normal.
 */
export function usableTodaySignal(signal: HistorySet | null | undefined): HistorySet | null {
  if (!signal) return null
  if (!isFiniteNum(signal.weight) || signal.weight <= 0) return null
  if (!isFiniteNum(signal.reps) || signal.reps <= 0) return null
  if (!isFiniteNum(signal.rpe) || signal.rpe <= 0) return null
  return signal
}

/** Inverte Epley: dado e1RM e o alvo (reps @ RPE), devolve o peso teórico. */
function weightForTarget(e1rm: number, targetReps: number, targetRpe: number): number {
  const rir = Math.max(0, 10 - clampRpe(targetRpe))
  const effectiveReps = targetReps + rir
  return e1rm / (1 + effectiveReps / 30)
}

/** Fator multiplicativo de prontidão (≤ 1). Só amortece; clampa no piso de segurança. */
export function readinessFactor(r: ReadinessToday | undefined): { factor: number; reason: string | null } {
  if (!r) return { factor: 1, reason: null }
  let factor = 1
  const reasons: string[] = []

  if (isFiniteNum(r.sleepHours)) {
    if (r.sleepHours < 5) { factor -= 0.07; reasons.push('sono curto') }
    else if (r.sleepHours < 6.5) { factor -= 0.03; reasons.push('sono abaixo do ideal') }
  }
  if (isFiniteNum(r.soreness)) {
    if (r.soreness >= 7) { factor -= 0.07; reasons.push('dor muscular alta') }
    else if (r.soreness >= 4) { factor -= 0.03; reasons.push('dor muscular moderada') }
  }
  if (isFiniteNum(r.energy)) {
    if (r.energy <= 1) { factor -= 0.05; reasons.push('energia baixa') }
    else if (r.energy <= 2) { factor -= 0.02; reasons.push('energia moderada') }
  }

  factor = Math.max(MIN_READINESS_FACTOR, Math.min(1, factor))
  return { factor, reason: reasons.length ? reasons.join(' + ') : null }
}

/**
 * Sugestão de carga para a série atual. Devolve weight=null quando não há base
 * (sem histórico) ou o equipamento não é de carga (peso corporal/elástico → progressão por reps).
 */
export function suggestWeight(input: SuggestInput): WeightSuggestion {
  const targetReps = isFiniteNum(input.targetReps) && input.targetReps > 0 ? Math.round(input.targetReps) : 0
  const targetRpe = isFiniteNum(input.targetRpe) ? clampRpe(input.targetRpe as number) : DEFAULT_TARGET_RPE
  const inc = resolveIncrement(input.equipment)

  // Séries válidas do histórico (peso e reps positivos).
  const valid = (Array.isArray(input.history) ? input.history : []).filter(
    (s) => isFiniteNum(s?.weight) && s.weight > 0 && isFiniteNum(s?.reps) && s.reps > 0,
  )
  const hasWeightHistory = valid.length > 0

  // Só trata como "sem carga externa" (progressão por reps) quando o equipamento diz
  // isso E não há histórico de peso real. A inferência de equipamento pelo nome erra em
  // exercícios com carga cujo nome parece peso corporal (ex.: "Abdominal infra" feito com
  // 50kg no cabo/máquina) — nesse caso o histórico de kg manda e o motor sugere normalmente.
  if (!inc.loadBearing && !hasWeightHistory) {
    return {
      weight: null,
      reps: targetReps || null,
      confidence: 'low',
      rationale: 'Exercício sem carga externa — progrida pelas repetições.',
    }
  }

  const todaySignal = usableTodaySignal(input.todaySignal)

  if (!hasWeightHistory) {
    // COLD START resolvido pelo reconhecimento: sem histórico, mas com uma série
    // de hoje medida, dá pra calibrar. É literalmente o que a mensagem abaixo
    // prometia ("faça a 1ª série pra calibrar") e o motor nunca cumpria.
    if (todaySignal) {
      const e1rmToday = estimateE1RM(todaySignal)
      if (isFiniteNum(e1rmToday)) {
        const rawToday = weightForTarget(e1rmToday, targetReps || todaySignal.reps, targetRpe)
        const roundIncrementCold = inc.loadBearing ? inc.increment : 2.5
        const weightCold = roundToIncrement(rawToday, roundIncrementCold, 'down')
        return {
          weight: weightCold > 0 ? weightCold : null,
          reps: targetReps || null,
          confidence: 'medium',
          rationale: `Calibrado pelo reconhecimento de hoje (${fmtKg(todaySignal.weight)}kg × ${todaySignal.reps} @RPE${todaySignal.rpe}) — sugeri ${fmtKg(weightCold)}kg.`,
        }
      }
    }
    return {
      weight: null,
      reps: targetReps || null,
      confidence: 'low',
      rationale: 'Sem histórico neste exercício — marque uma série como Reconhecimento e preencha o RPE pra calibrar.',
    }
  }

  // Incremento de arredondamento: o do equipamento quando é de carga; senão o histórico
  // de peso prova que é carregável, então usa um passo padrão seguro de 2,5 kg.
  const roundIncrement = inc.loadBearing ? inc.increment : 2.5

  // Referência = melhor e1RM da última sessão + a série de maior carga (âncora anti-regressão).
  const e1rms = valid.map(estimateE1RM).filter(isFiniteNum) as number[]
  const bestE1rm = Math.max(...e1rms)
  const topWeight = Math.max(...valid.map((s) => s.weight))
  const anyFailed = valid.some((s) => s.failed === true)

  // ── Sinal do dia (série de reconhecimento) ────────────────────────────────
  // Compara a força medida HOJE com a projetada pelo histórico. O quociente é o
  // "fator do dia": <1 = você está pior que na última vez, >1 = melhor.
  let dayFactor = 1
  let dayNote: string | null = null
  if (todaySignal) {
    const e1rmToday = estimateE1RM(todaySignal)
    if (isFiniteNum(e1rmToday) && bestE1rm > 0) {
      const rawFactor = e1rmToday / bestE1rm
      const rir = Math.max(0, 10 - clampRpe(todaySignal.rpe as number))
      // RPE impreciso (longe da falha) só autoriza amortecer, nunca empurrar peso.
      const upperBound = rir >= UNRELIABLE_RIR ? 1 : DAY_FACTOR_MAX
      dayFactor = Math.max(DAY_FACTOR_MIN, Math.min(upperBound, rawFactor))
      const pct = Math.round((dayFactor - 1) * 100)
      dayNote = `reconhecimento de hoje (${fmtKg(todaySignal.weight)}kg × ${todaySignal.reps} @RPE${todaySignal.rpe})${pct !== 0 ? `: ${pct > 0 ? '+' : ''}${pct}%` : ' bateu com o histórico'}`
    }
  }

  let raw = weightForTarget(bestE1rm * dayFactor, targetReps || valid[0].reps, targetRpe)

  // Trava anti-regressão: num dia normal não sugere MENOS que a maior carga anterior.
  //
  // Ela é SUSPENSA quando existe sinal do dia apontando para baixo: aí não é chute,
  // é medição — o motor tem evidência de hoje para reduzir. Sem esta exceção o
  // cálculo do reconhecimento viraria enfeite (calcularia 117 e exibiria 130).
  // O piso continua garantido pelo clamp de DAY_FACTOR_MIN.
  const dayAllowsRegression = dayFactor < 1
  if (raw < topWeight && !dayAllowsRegression) raw = topWeight

  // Se a última sessão foi à falha, não progride (segura na carga anterior).
  //
  // `failed` vem SÓ da falha que o usuário marcou na série (o toggle). Métodos que
  // vão à falha por definição — Heavy Duty, Repetições Forçadas — deliberadamente
  // NÃO gravam `log.failure`: neles toda série é à falha, então marcar sempre
  // congelaria a carga no topWeight para sempre e o aluno nunca progrediria.
  // Decisão de produto do dono (2026-07-25), travada em
  // set-renderers/__tests__/failureIsManualOnly.test.ts. Não "corrija" isso:
  // o `reps_failure` desses métodos é a CONTAGEM de reps até falhar, coisa
  // diferente da flag.
  if (anyFailed && raw > topWeight) raw = topWeight

  // Trava de salto: no máximo +10% vs. a maior carga anterior (segurança).
  const ceiling = topWeight * (1 + MAX_SESSION_INCREASE)
  if (raw > ceiling) raw = ceiling

  // Modulação de prontidão (só amortece).
  const { factor, reason } = readinessFactor(input.readiness)
  const modulated = raw * factor

  // Substituto → mais conservador: nunca acima da carga âncora do substituto.
  const preRound = input.fromSubstitute ? Math.min(modulated, topWeight) : modulated

  const rounded = roundToIncrement(preRound, roundIncrement, 'down')

  // Trava anti-regressão PÓS-arredondamento: o incremento é um palpite pelo nome do
  // exercício e nem sempre bate com a máquina real (ex.: "Flexora em pé" → passo de
  // 5 kg, mas o usuário treina com 8 kg). Arredondar pra baixo derrubaria 8 → 5 kg —
  // uma regressão de 37% num dia normal. O histórico prova que topWeight é montável,
  // então num dia sem amortecimento (e fora do cold-start por substituto) ele é o piso.
  // `dayAllowsRegression` entra aqui pelo mesmo motivo do piso acima: quando o
  // reconhecimento de hoje mandou reduzir, restaurar o topWeight anularia a medição.
  // Deload DESLIGADO neste exercício (toggle por-exercício): o motor nunca reduz —
  // o piso é o topWeight, valha o que valer a prontidão ou o sinal do dia. Subir
  // continua livre. Default (undefined → LIGADO) mantém o comportamento anterior.
  const deloadOff = input.deloadEnabled === false
  const heldByDeloadOff = deloadOff && rounded < topWeight
  const weight =
    heldByDeloadOff ||
    (factor === 1 && !input.fromSubstitute && !dayAllowsRegression && rounded < topWeight)
      ? topWeight
      : rounded

  // Confiança. Medida de hoje vale mais que projeção do histórico.
  const hasRpe = valid.some((s) => isFiniteNum(s.rpe))
  let confidence: WeightSuggestion['confidence'] = hasRpe || todaySignal ? 'high' : 'medium'
  if (input.fromSubstitute && !todaySignal) confidence = 'low'

  // Explicação.
  const ref = valid.reduce((a, b) => (b.weight >= a.weight ? b : a), valid[0])
  const refStr = `${fmtKg(ref.weight)}kg × ${ref.reps}${isFiniteNum(ref.rpe) ? ` @RPE${ref.rpe}` : ''}`
  const parts: string[] = []
  parts.push(input.fromSubstitute ? `Base num exercício similar (${refStr})` : `Última vez: ${refStr}`)
  if (weight > topWeight) parts.push(`subi p/ ${fmtKg(weight)}kg`)
  else if (weight === topWeight) parts.push(`mantém ${fmtKg(weight)}kg`)
  else parts.push(`ajustei p/ ${fmtKg(weight)}kg`)
  if (dayNote) parts.push(dayNote)
  // Deload off e o motor teria reduzido: explica por que segurou (senão o dayNote/
  // prontidão aparecem apontando pra baixo e o número "mantém", contradizendo).
  if (heldByDeloadOff) parts.push('deload desligado — mantida a carga')
  else if (reason && factor < 1) parts.push(`(-${Math.round((1 - factor) * 100)}%: ${reason})`)

  return { weight, reps: targetReps || null, confidence, rationale: parts.join(' — ') }
}
