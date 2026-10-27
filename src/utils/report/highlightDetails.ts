/**
 * @module report/highlightDetails
 *
 * O DETALHE por trás dos quatro cards de "Destaques da sessão" do relatório.
 *
 * Cada card mostra um número só (volume total, variação contra a sessão
 * anterior, séries completas, PRs). Tocar nele abre uma janela que diz DE ONDE
 * o número veio, exercício a exercício. A regra deste módulo é uma: **a soma do
 * detalhe tem que bater com o card.** Janela que explica um número com outro
 * número é pior que janela nenhuma — por isso as contas usam as MESMAS fontes do
 * card (`setVolume`/`isWorkingSet`, que alimentam `sessionVolumeKg`, e
 * `isSetCompleted`), e o hook do relatório deriva o total de séries daqui.
 */
import { isWorkingSet, setTopWeightReps, setVolume, nonWorkingSetLabel } from '@/utils/report/setVolume'
import { isSetCompleted } from '@/utils/report/setCompletion'
import { normalizeExerciseKey } from '@/utils/report/formatters'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)

const nomeDoExercicio = (exercises: readonly unknown[], exIdx: number): string => {
  const ex = exercises[exIdx]
  const nome = isRec(ex) ? String(ex.name ?? '').trim() : ''
  return nome || `Exercício ${exIdx + 1}`
}

/** Índice do exercício a partir da chave do log (`"exIdx-setIdx"`). */
const exIdxDaChave = (chave: string): number | null => {
  const m = /^(\d+)-\d+$/.exec(chave)
  return m ? Number(m[1]) : null
}

const SEM_EXERCICIO = '__sem_exercicio__'

/**
 * Volume de cada exercício (kg). Agrupa por NOME normalizado: o mesmo exercício
 * repetido no treino é uma coisa só para quem lê.
 *
 * Varre o mapa de logs INTEIRO, como `sessionVolumeKg` — log cuja chave não
 * aponta para exercício nenhum entra em "Outras séries" em vez de sumir, senão
 * a soma da janela não bateria com o card.
 */
export interface VolumeDoExercicio {
  chave: string
  nome: string
  volumeKg: number
  series: number
}

export function volumePorExercicio(exercisesRaw: unknown, logsRaw: unknown): VolumeDoExercicio[] {
  const exercises = Array.isArray(exercisesRaw) ? exercisesRaw : []
  const logs = isRec(logsRaw) ? logsRaw : {}
  const porChave = new Map<string, VolumeDoExercicio>()

  for (const [chaveLog, log] of Object.entries(logs)) {
    if (!isWorkingSet(log)) continue
    const v = setVolume(log)
    if (!Number.isFinite(v) || v <= 0) continue
    const exIdx = exIdxDaChave(chaveLog)
    const temExercicio = exIdx !== null && exIdx < exercises.length
    const nome = temExercicio ? nomeDoExercicio(exercises, exIdx) : 'Outras séries'
    const chave = temExercicio ? normalizeExerciseKey(nome) || `#${exIdx}` : SEM_EXERCICIO
    const atual = porChave.get(chave)
    if (atual) {
      atual.volumeKg += v
      atual.series += 1
    } else {
      porChave.set(chave, { chave, nome, volumeKg: v, series: 1 })
    }
  }

  return Array.from(porChave.values()).sort((a, b) => b.volumeKg - a.volumeKg)
}

/**
 * Volume de hoje × sessão anterior, por exercício. Exercício que só existe de um
 * lado entra com zero do outro — é justamente o que explica boa parte das
 * quedas ("não fiz o stiff hoje"). A soma de `deltaKg` é exatamente
 * `volume atual − volume anterior`, a mesma conta do card.
 */
export interface ComparacaoDoExercicio {
  chave: string
  nome: string
  atualKg: number
  anteriorKg: number
  deltaKg: number
}

export function comparacaoDeVolume(
  atual: { exercises: unknown; logs: unknown },
  anterior: { exercises: unknown; logs: unknown },
): ComparacaoDoExercicio[] {
  const hoje = volumePorExercicio(atual.exercises, atual.logs)
  const antes = volumePorExercicio(anterior.exercises, anterior.logs)
  const porChave = new Map<string, ComparacaoDoExercicio>()

  for (const e of hoje) {
    porChave.set(e.chave, { chave: e.chave, nome: e.nome, atualKg: e.volumeKg, anteriorKg: 0, deltaKg: e.volumeKg })
  }
  for (const e of antes) {
    const linha = porChave.get(e.chave)
    if (linha) {
      linha.anteriorKg = e.volumeKg
      linha.deltaKg = linha.atualKg - e.volumeKg
    } else {
      porChave.set(e.chave, { chave: e.chave, nome: e.nome, atualKg: 0, anteriorKg: e.volumeKg, deltaKg: -e.volumeKg })
    }
  }

  // A maior diferença primeiro, para qualquer lado: é o que responde "por quê?".
  return Array.from(porChave.values()).sort((a, b) => Math.abs(b.deltaKg) - Math.abs(a.deltaKg))
}

/**
 * Séries planejadas × feitas de cada exercício, com o que foi registrado em cada
 * uma. É a MESMA conta do card (`Number(ex.sets)` planejadas, `isSetCompleted`
 * feitas) — o hook do relatório soma o total a partir daqui.
 */
export interface SerieDoDetalhe {
  numero: number
  feita: boolean
  peso: number
  reps: number
  /** "Aquec." / "Recon." quando não é série de trabalho. */
  marca: string | null
}

export interface SeriesDoExercicio {
  nome: string
  planejadas: number
  feitas: number
  series: SerieDoDetalhe[]
}

export function seriesPorExercicio(exercisesRaw: unknown, logsRaw: unknown): SeriesDoExercicio[] {
  const exercises = Array.isArray(exercisesRaw) ? exercisesRaw : []
  const logs = isRec(logsRaw) ? logsRaw : {}
  const out: SeriesDoExercicio[] = []

  exercises.forEach((ex, exIdx) => {
    const planejadas = isRec(ex) ? Number(ex.sets ?? 0) || 0 : 0
    if (planejadas <= 0) return
    const series: SerieDoDetalhe[] = []
    let feitas = 0
    for (let sIdx = 0; sIdx < planejadas; sIdx++) {
      const log = logs[`${exIdx}-${sIdx}`]
      const feita = isSetCompleted(log)
      if (feita) feitas++
      const { weight, reps } = setTopWeightReps(log)
      series.push({ numero: sIdx + 1, feita, peso: weight, reps, marca: nonWorkingSetLabel(log) })
    }
    out.push({ nome: nomeDoExercicio(exercises, exIdx), planejadas, feitas, series })
  })

  return out
}

export function totaisDeSeries(lista: readonly SeriesDoExercicio[]): {
  setsCompleted: number
  setsPlanned: number
  setCompletionPct: number
} {
  let planned = 0
  let completed = 0
  for (const e of lista) {
    planned += e.planejadas
    completed += e.feitas
  }
  return {
    setsCompleted: completed,
    setsPlanned: planned,
    setCompletionPct: planned > 0 ? Math.round((completed / planned) * 100) : 0,
  }
}
