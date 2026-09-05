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
 * A precedência do peso é a mesma que o CAMPO da série mostra — log primeiro,
 * plano depois. Divergir disso faria a tela de descanso prometer um número e o
 * card entregar outro, que é a classe de defeito mais cara deste repo.
 */

type UnknownRecord = Record<string, unknown>

const isObject = (v: unknown): v is UnknownRecord =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export interface ProximaSerie {
  /** Nome do exercício — o herói da tela. */
  exerciseName: string
  /** "2ª série", "1ª série". */
  setLabel: string
  /** Frase completa, mantida para quem já consumia `nextSetLabel`. */
  label: string
  /** "84 kg" — vazio quando não há peso conhecido (não inventamos número). */
  weight: string
  /** "6-10" — o alvo de repetições, como o card escreve. */
  reps: string
  /** "8" — RPE alvo. */
  rpe: string
}

/** Aceita "84", 84, "84.5", "84,5". Vazio/absurdo vira ''. */
const formatarPeso = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return ''
  // 84 e não 84.0; 84,5 mantém a casa. Vírgula porque o app é pt-BR.
  const arredondado = Math.round(n * 10) / 10
  return `${String(arredondado).replace('.', ',')} kg`
}

const texto = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  return s && s !== '0' ? s : ''
}

const setsDoExercicio = (ex: UnknownRecord): number => {
  const header = Math.max(0, Number.parseInt(String(ex?.sets ?? '0'), 10) || 0)
  const sd = ex?.setDetails ?? ex?.set_details
  return Math.max(header, Array.isArray(sd) ? sd.length : 0)
}

const detalheDaSerie = (ex: UnknownRecord | undefined, idx: number): UnknownRecord => {
  const sd = ex?.setDetails ?? ex?.set_details
  const item = Array.isArray(sd) ? sd[idx] : undefined
  return isObject(item) ? item : {}
}

/**
 * Descreve a próxima série. Devolve `null` quando não existe uma — última série
 * do último exercício. Nesse caso a tela NÃO deve inventar um "próximo": dizer
 * o que vem quando não vem nada é pior que ficar em silêncio.
 */
export function descreverProximaSerie(params: {
  exercises: unknown
  /** Mapa de logs da sessão, chave `"exIdx-setIdx"`. */
  logs?: unknown
  /** Índice do exercício da série que ACABOU de ser concluída. */
  exIdx: number
  /** Índice da série que acabou de ser concluída. */
  setIdx: number
}): ProximaSerie | null {
  const { exIdx, setIdx } = params
  const exercises = Array.isArray(params.exercises) ? params.exercises : []
  const logs = isObject(params.logs) ? params.logs : {}

  if (!Number.isInteger(exIdx) || exIdx < 0 || !Number.isInteger(setIdx) || setIdx < 0) return null

  const atual = isObject(exercises[exIdx]) ? (exercises[exIdx] as UnknownRecord) : null
  if (!atual) return null

  // Próxima série do MESMO exercício, ou a primeira do exercício seguinte.
  const mesmaSerie = setIdx + 1 < setsDoExercicio(atual)
  const proxExIdx = mesmaSerie ? exIdx : exIdx + 1
  const proxSetIdx = mesmaSerie ? setIdx + 1 : 0

  const proxEx = isObject(exercises[proxExIdx]) ? (exercises[proxExIdx] as UnknownRecord) : null
  if (!proxEx) return null

  const exerciseName = String(proxEx?.name ?? '').trim()
  const setLabel = `${proxSetIdx + 1}ª série`
  const label = exerciseName
    ? `${setLabel} de ${exerciseName}`
    : mesmaSerie
      ? setLabel
      : '1ª série do próximo exercício'

  const log = isObject(logs[`${proxExIdx}-${proxSetIdx}`])
    ? (logs[`${proxExIdx}-${proxSetIdx}`] as UnknownRecord)
    : {}
  const detalhe = detalheDaSerie(proxEx, proxSetIdx)

  // Log primeiro: é o que o CAMPO daquela série mostra neste instante — inclusive
  // a sugestão que o motor de carga já escreveu lá. O plano é o fallback.
  return {
    exerciseName,
    setLabel,
    label,
    weight: formatarPeso(log.weight) || formatarPeso(detalhe.weight),
    reps: texto(log.reps) || texto(detalhe.reps),
    rpe: texto(log.rpe) || texto(detalhe.rpe),
  }
}
