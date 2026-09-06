/**
 * proximaSerie — o que vem DEPOIS da série que o usuário acabou de concluir.
 *
 * Alimenta a tela de fim de descanso ("BORA!"). Ela tem 100% da atenção do
 * atleta por dois segundos, de pé na academia — e até 05/09/2026 usava esse
 * espaço para dizer "BORA!" e o nome do exercício, sem a informação que ele de
 * fato precisa: **quanto peso pôr na barra**. O app calcula esse número
 * (motor de carga automática) e não o mostrava no único instante em que ele
 * decide a ação seguinte.
 *
 * ⚠️ Afirmar a série ERRADA em 36px é pior que não afirmar nada. A primeira
 * versão (#1076) andava por índice bruto e errou em três famílias, todas pegas
 * pelo code review no mesmo dia:
 *
 *  - **Bi-Set/Tri-Set**: o descanso nasce ao concluir o ÚLTIMO membro, e a
 *    auto-alternância (`ExerciseList`) manda o atleta de volta ao PRIMEIRO na
 *    rodada seguinte. Por índice, a tela anunciava a próxima série do último
 *    membro — exercício e carga errados.
 *  - **Unilateral**: o log grava `L_weight`/`R_weight`, nunca `weight`. A carga
 *    que o motor tinha acabado de calcular sumia da tela.
 *  - **Cluster / Rest-Pause**: o descanso é DENTRO da série. Anunciar "3ª série"
 *    enquanto faltam dois blocos da 2ª é mentir para quem está com a barra na
 *    mão. Quem decide isso é o chamador (`kind`), e ele simplesmente não
 *    pergunta.
 *
 * A regra que ficou: **quem já sabe a próxima chave manda** (`nextKey` dos
 * renderers); o cálculo por índice é só o fallback, e ele respeita o grupo.
 */
import { isRecord } from '@/utils/guards'
import { setsCountOfExercise } from './deferredExercises'
import { buildExerciseGroups } from '@/lib/workoutGroups'

export interface ProximaSerie {
  /** Nome do exercício — o herói da tela. */
  exerciseName: string
  /** "2ª série", "1ª série". */
  setLabel: string
  /** Frase completa, mantida para quem já consumia `nextSetLabel`. */
  label: string
  /** "84 kg", ou "20 / 22 kg" quando os lados de um unilateral diferem. Vazio
   *  quando não há peso conhecido — não inventamos número. */
  weight: string
  /** "6-10" — o alvo de repetições, como o card escreve. */
  reps: string
  /** "8" — RPE alvo. */
  rpe: string
}

/**
 * Descansos que acontecem DENTRO de uma série. Ao terminar, o atleta volta para
 * a MESMA série (próximo bloco, próxima mini-série) — não existe "próxima série"
 * a anunciar, e anunciar a seguinte é errado.
 */
export const KINDS_INTRA_SERIE: ReadonlySet<string> = new Set(['cluster', 'rest_pause'])

/** Aceita "84", 84, "84.5", "84,5". Vazio/absurdo vira ''. */
const formatarNumeroKg = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return ''
  // 84 e não 84.0; 84,5 mantém a casa. Vírgula porque o app é pt-BR.
  return String(Math.round(n * 10) / 10).replace('.', ',')
}

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  return s && s !== '0' ? s : ''
}

/**
 * O peso como o CAMPO da série o mostra — log com `??`, não `||`.
 *
 * `normalSet` resolve `log.weight ?? plano.weight`: uma string VAZIA no log é
 * valor (o usuário apagou o campo, `weightSource: 'user'`, e o motor respeita),
 * não ausência. Cair no plano nesse caso faria a tela dizer "84 kg" em negrito
 * enquanto o card está em branco.
 *
 * Unilateral: `L_weight`/`R_weight`. Lados iguais viram um número; diferentes
 * viram "L / R" — a média (que `extractLogWeight` faz para o MOTOR) seria um
 * peso que não existe em nenhum dos dois lados.
 */
const pesoDaSerie = (log: Record<string, unknown>, detalhe: Record<string, unknown>): string => {
  const L = formatarNumeroKg(log.L_weight)
  const R = formatarNumeroKg(log.R_weight)
  if (L || R) {
    if (L && R && L !== R) return `${L} / ${R} kg`
    return `${L || R} kg`
  }
  const bruto = log.weight ?? detalhe.weight
  const n = formatarNumeroKg(bruto)
  return n ? `${n} kg` : ''
}

const valorDaSerie = (
  log: Record<string, unknown>,
  detalhe: Record<string, unknown>,
  campo: 'reps' | 'rpe',
): string => {
  const L = texto(log[`L_${campo}`])
  const R = texto(log[`R_${campo}`])
  if (L || R) return L && R && L !== R ? `${L} / ${R}` : L || R
  return texto(log[campo] ?? detalhe[campo])
}

const detalheDaSerie = (ex: Record<string, unknown> | undefined, idx: number): Record<string, unknown> => {
  const sd = ex?.setDetails ?? ex?.set_details
  const item = Array.isArray(sd) ? sd[idx] : undefined
  return isRecord(item) ? item : {}
}

/** "3-1" → { exIdx: 3, setIdx: 1 }; qualquer outra coisa → null. */
export function parseChaveDeSerie(key: unknown): { exIdx: number; setIdx: number } | null {
  const partes = String(key ?? '').trim().split('-')
  if (partes.length !== 2) return null
  const exIdx = Number(partes[0])
  const setIdx = Number(partes[1])
  if (!Number.isInteger(exIdx) || exIdx < 0 || !Number.isInteger(setIdx) || setIdx < 0) return null
  return { exIdx, setIdx }
}

export interface ProximaSerieParams {
  exercises: unknown
  /** Mapa de logs da sessão, chave `"exIdx-setIdx"`. */
  logs?: unknown
  /** Índice do exercício da série que ACABOU de ser concluída. */
  exIdx: number
  /** Índice da série que acabou de ser concluída. */
  setIdx: number
  /**
   * `kind` do descanso, como os renderers o passam. Em descanso INTRA-série
   * (`KINDS_INTRA_SERIE`) não há próxima série a anunciar → `null`.
   */
  kind?: string | null
  /**
   * A chave da próxima série, quando o chamador JÁ SABE (`normalSet` passa
   * `"exIdx-setIdx"`). Vence qualquer cálculo daqui. `null`/ausente = calcular.
   */
  nextKey?: string | null
}

/**
 * Descreve a próxima série. Devolve `null` quando não existe uma — última série
 * do último exercício, ou descanso dentro de uma série. Nesse caso a tela NÃO
 * deve inventar um "próximo": dizer o que vem quando não vem nada é pior que
 * ficar em silêncio.
 */
export function descreverProximaSerie(params: ProximaSerieParams): ProximaSerie | null {
  const { exIdx, setIdx } = params
  if (params.kind && KINDS_INTRA_SERIE.has(params.kind)) return null

  const exercises = Array.isArray(params.exercises) ? params.exercises : []
  const logs = isRecord(params.logs) ? params.logs : {}

  if (!Number.isInteger(exIdx) || exIdx < 0 || !Number.isInteger(setIdx) || setIdx < 0) return null

  const atual = isRecord(exercises[exIdx]) ? (exercises[exIdx] as Record<string, unknown>) : null
  if (!atual) return null

  const alvo = resolverAlvo(exercises, logs, exIdx, setIdx, params.nextKey)
  if (!alvo) return null

  const proxEx = isRecord(exercises[alvo.exIdx]) ? (exercises[alvo.exIdx] as Record<string, unknown>) : null
  if (!proxEx) return null

  const exerciseName = String(proxEx?.name ?? '').trim()
  const setLabel = `${alvo.setIdx + 1}ª série`
  const label = exerciseName
    ? `${setLabel} de ${exerciseName}`
    : alvo.exIdx === exIdx
      ? setLabel
      : '1ª série do próximo exercício'

  const log = isRecord(logs[`${alvo.exIdx}-${alvo.setIdx}`])
    ? (logs[`${alvo.exIdx}-${alvo.setIdx}`] as Record<string, unknown>)
    : {}
  const detalhe = detalheDaSerie(proxEx, alvo.setIdx)

  return {
    exerciseName,
    setLabel,
    label,
    weight: pesoDaSerie(log, detalhe),
    reps: valorDaSerie(log, detalhe, 'reps'),
    rpe: valorDaSerie(log, detalhe, 'rpe'),
  }
}

/** A primeira série ainda não concluída do exercício, ou `null` se acabou. */
function primeiraSeriePendente(
  exercises: unknown[],
  logs: Record<string, unknown>,
  exIdx: number,
): number | null {
  const total = setsCountOfExercise(exercises[exIdx])
  for (let i = 0; i < total; i++) {
    const log = logs[`${exIdx}-${i}`]
    if (!(isRecord(log) && log.done === true)) return i
  }
  return null
}

/**
 * Onde o atleta vai depois desta série — na ORDEM em que o app decide de fato.
 *
 * 1. Grupo (Bi-Set…): a MESMA regra do `ExerciseList`, que alterna para o
 *    membro seguinte do ciclo INDEPENDENTEMENTE de qual renderer concluiu a
 *    série. Por isso o grupo vem ANTES do `nextKey`: uma série de membro de
 *    Bi-Set com `per_set_method: 'Normal'` renderiza pelo `normalSet`, que
 *    manda `nextKey` do MESMO exercício — e a tela anunciaria o exercício
 *    errado (segundo code review, #1077). Como lá, só alterna fora da última
 *    série, para outro membro, e só se ele ainda tiver série PENDENTE — um
 *    membro com séries a menos já esgotado não recebe "5ª série" inventada.
 * 2. `nextKey` do chamador, quando válido.
 * 3. Padrão: próxima série do mesmo exercício, senão a primeira PENDENTE do
 *    exercício seguinte (não a série 0 cega — ela pode já estar feita).
 */
function resolverAlvo(
  exercises: unknown[],
  logs: Record<string, unknown>,
  exIdx: number,
  setIdx: number,
  nextKey: string | null | undefined,
): { exIdx: number; setIdx: number } | null {
  const setsAtual = setsCountOfExercise(exercises[exIdx])
  const naUltimaSerie = setIdx + 1 >= setsAtual

  const grupo = buildExerciseGroups(exercises).get(exIdx)
  if (grupo && !naUltimaSerie) {
    const proximoMembro = grupo.members[(grupo.position + 1) % grupo.size]
    if (typeof proximoMembro === 'number' && proximoMembro !== exIdx) {
      const pendente = primeiraSeriePendente(exercises, logs, proximoMembro)
      if (pendente !== null) return { exIdx: proximoMembro, setIdx: pendente }
    }
  }

  const informado = parseChaveDeSerie(nextKey)
  if (informado) return informado

  if (!naUltimaSerie) return { exIdx, setIdx: setIdx + 1 }
  if (exercises[exIdx + 1] === undefined) return null
  const pendente = primeiraSeriePendente(exercises, logs, exIdx + 1)
  return { exIdx: exIdx + 1, setIdx: pendente ?? 0 }
}
