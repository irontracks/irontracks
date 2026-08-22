/**
 * @module periodSessionDetails
 *
 * Detalhe série a série de cada sessão de um relatório de PERÍODO (semanal /
 * mensal). Existe porque o relatório mensal exportava só o agregado: métricas
 * do mês, top exercícios e uma tabela de sessões com data · duração · volume.
 * Quem baixava o arquivo não encontrava lá o que de fato treinou — nenhum
 * exercício, nenhum peso, nenhuma repetição (relatado pelo dono em 22/08/2026:
 * "preciso que baixe o arquivo completo de todos os treinos de um mês").
 *
 * A leitura das séries passa pela FONTE ÚNICA (`setVolume.ts` + `formatStages`),
 * a mesma do PDF de sessão e do histórico — sem isso o mesmo treino apareceria
 * com números diferentes em dois arquivos do mesmo app:
 *   - unilateral (L_/R_) soma os dois lados no volume e nas reps;
 *   - drop-set/stripping exibe as ETAPAS ("57 → 36"), porque o topo do log
 *     guarda só a última etapa e esconde o drop inteiro;
 *   - cluster/wave têm peso próprio por bloco/tier.
 *
 * Aquecimento e reconhecimento (feeler) ENTRAM na listagem — o arquivo é o
 * registro do que foi feito — mas ficam marcados e fora dos totais, exatamente
 * como no relatório da sessão.
 */
import { setVolume, setTopWeightReps, setTotalReps, isWorkingSet, nonWorkingSetLabel } from './setVolume'
import { formatSetStages } from './formatStages'

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Uma sessão crua do histórico, como vem do JSON de `workouts.notes`. */
export interface PeriodSessionSource {
  /** Data da sessão (ISO, ms ou Date). */
  date?: unknown
  /** Duração em SEGUNDOS (o histórico guarda em segundos). */
  totalTime?: unknown
  /** Nome do treino ("Lower A"). */
  title?: unknown
  /** Mapa "exIdx-setIdx" → log da série. */
  logs?: unknown
  /** Lista de exercícios da sessão (índice casa com o `exIdx` da chave do log). */
  exercises?: unknown
}

export interface PeriodDetailSet {
  /** 1-based, como o usuário vê. */
  index: number
  /** "80" ou "57 → 36" (etapas do drop/stripping). */
  weight: string
  /** "12" ou "12 → 18". */
  reps: string
  rpe: string
  /** "Aquec." / "Recon." em série que não conta; vazio na série de trabalho. */
  tag: string
  /** Marcação MANUAL do usuário — alimenta o motor de carga automática. */
  failure: boolean
  volumeKg: number
}

export interface PeriodDetailExercise {
  name: string
  /** Método avançado ("Bi-Set", "Drop-set"…); vazio em série normal. */
  method: string
  sets: PeriodDetailSet[]
  volumeKg: number
  /** Só das séries de trabalho — aquecimento não conta. */
  totalReps: number
}

export interface PeriodSessionDetail {
  date: unknown
  title: string
  minutes: number
  volumeKg: number
  /** Séries de trabalho (aquecimento fora). */
  setsCount: number
  exercises: PeriodDetailExercise[]
}

const text = (v: unknown): string => String(v ?? '').trim()

/** Índice do exercício a partir da chave "exIdx-setIdx". `null` se ilegível. */
const parseLogKey = (key: string): { exIdx: number; setIdx: number } | null => {
  const parts = String(key || '').split('-')
  const exIdx = Number.parseInt(parts[0] ?? '', 10)
  const setIdx = Number.parseInt(parts[1] ?? '', 10)
  if (!Number.isFinite(exIdx) || exIdx < 0) return null
  return { exIdx, setIdx: Number.isFinite(setIdx) && setIdx >= 0 ? setIdx : 0 }
}

/**
 * Detalhe de UMA sessão. `null` quando não há nenhuma série logada — sessão
 * vazia no arquivo é ruído, não informação.
 */
export function buildPeriodSessionDetail(source: PeriodSessionSource): PeriodSessionDetail | null {
  const logs = isRec(source?.logs) ? source.logs : {}
  const exercises: unknown[] = Array.isArray(source?.exercises) ? source.exercises : []

  // Agrupa por exercício preservando a ordem em que ele aparece na sessão.
  const byExercise = new Map<number, PeriodDetailExercise>()

  for (const [key, log] of Object.entries(logs)) {
    if (!isRec(log)) continue
    const parsed = parseLogKey(key)
    if (!parsed) continue

    const stages = formatSetStages(log)
    const { weight, reps } = setTopWeightReps(log)
    const weightLabel = stages ? stages.weights : weight > 0 ? String(weight) : ''
    const repsLabel = stages ? stages.reps : reps > 0 ? String(setTotalReps(log)) : ''
    // Série sem peso E sem reps nunca foi executada — não vai para o arquivo.
    if (!weightLabel && !repsLabel) continue

    const ex = exercises[parsed.exIdx]
    const exRec = isRec(ex) ? ex : null
    const name = text(exRec?.name) || 'Exercício'
    const methodRaw = text(exRec?.method)
    const method = methodRaw && methodRaw.toLowerCase() !== 'normal' ? methodRaw : ''

    const working = isWorkingSet(log)
    const vol = working ? Math.max(0, Math.round(setVolume(log))) : 0

    const entry = byExercise.get(parsed.exIdx) ?? { name, method, sets: [], volumeKg: 0, totalReps: 0 }
    entry.sets.push({
      index: parsed.setIdx + 1,
      weight: weightLabel || '—',
      reps: repsLabel || '—',
      rpe: text(log.rpe ?? log.RPE),
      tag: nonWorkingSetLabel(log) ?? '',
      // Aceita boolean e "true": o log é serializado como JSON em workouts.notes.
      failure: log.failure === true || text(log.failure).toLowerCase() === 'true',
      volumeKg: vol,
    })
    entry.volumeKg += vol
    if (working) entry.totalReps += setTotalReps(log)
    byExercise.set(parsed.exIdx, entry)
  }

  if (byExercise.size === 0) return null

  const ordered = [...byExercise.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, ex]) => {
      ex.sets.sort((a, b) => a.index - b.index)
      return ex
    })

  const seconds = Number(source?.totalTime) || 0
  const setsCount = ordered.reduce((acc, ex) => acc + ex.sets.filter((s) => !s.tag).length, 0)

  return {
    date: source?.date ?? null,
    title: text(source?.title) || 'Treino',
    minutes: Math.max(0, Math.round(seconds / 60)),
    volumeKg: ordered.reduce((acc, ex) => acc + ex.volumeKg, 0),
    setsCount,
    exercises: ordered,
  }
}

/** Detalhe de todas as sessões, da mais recente para a mais antiga. */
export function buildPeriodSessionDetails(sources: PeriodSessionSource[]): PeriodSessionDetail[] {
  const list = Array.isArray(sources) ? sources : []
  const out: PeriodSessionDetail[] = []
  for (const source of list) {
    const detail = buildPeriodSessionDetail(source)
    if (detail) out.push(detail)
  }
  const ms = (v: unknown): number => {
    const t = new Date(typeof v === 'string' || typeof v === 'number' || v instanceof Date ? v : 0).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return out.sort((a, b) => ms(b.date) - ms(a.date))
}
