/**
 * useWorkoutAutoload — fiação do motor de auto-regulação de carga (Fase 1).
 *
 * Reusa o `reportHistory` (histórico por exercício, já computado pelo useWorkoutDeload),
 * busca o check-in pré-treino de HOJE 1x (prontidão), infere o equipamento pelo nome,
 * e monta `autoLoadSuggestions` keyed por "exIdx-setIdx" via o motor puro `suggestWeight`.
 *
 * Gated: só computa quando `settings.autoLoadBeta` (liberado por perfil, via DB) E
 * `settings.autoLoad` (a chavinha do usuário) estão ligados. Fora disso devolve mapa
 * vazio e não faz fetch — custo/efeito zero pro resto dos usuários.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { ReportHistory } from '../types'
import { normalizeExerciseKey, extractLogWeight, extractLogReps, extractLogRpe, isObject } from '../utils'
import { resolveSetType } from '../SetTypePopover'
import { suggestWeight, type HistorySet, type ReadinessToday } from '@/utils/autoload/suggestWeight'
import { inferEquipmentFromName } from '@/utils/autoload/equipmentFromName'
import { logWarnRemote } from '@/lib/logger'

export interface AutoloadSuggestion {
  weight: number | null
  reps: number | null
  confidence: 'high' | 'medium' | 'low'
  rationale: string
}

interface Params {
  exercises: unknown[]
  reportHistory: ReportHistory | null | undefined
  settings: Record<string, unknown> | null | undefined
  userId?: string | null
  /**
   * Logs da sessão em curso — usados SÓ para achar séries de Reconhecimento já
   * concluídas (o sinal do dia). Não se depende deste objeto no memo pesado: ele
   * muda a cada tecla, e recalcular todas as sugestões nesse ritmo travaria a tela
   * do treino. Ver `feelerSignalKey` abaixo.
   */
  logs?: Record<string, unknown> | null
}

/** Sinal do dia extraído de uma série de Reconhecimento concluída. */
interface FeelerSignal {
  weight: number
  reps: number
  rpe: number
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const parseTopReps = (v: unknown): number => {
  const nums = String(v ?? '').match(/\d+/g)
  if (!nums || !nums.length) return 0
  return Math.max(...nums.map(Number))
}
const parseRpe = (v: unknown): number | null => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}
const asNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Reconstrói as séries da última sessão de um exercício a partir dos arrays por-set. */
export function buildHistorySets(item: {
  setWeights?: (number | null)[] | null
  setReps?: (number | null)[] | null
  setRpes?: (number | null)[] | null
  setFailures?: (boolean | null)[] | null
} | null | undefined): HistorySet[] {
  if (!item) return []
  const w = Array.isArray(item.setWeights) ? item.setWeights : []
  const r = Array.isArray(item.setReps) ? item.setReps : []
  const rp = Array.isArray(item.setRpes) ? item.setRpes : []
  // `failed` alimenta a trava anti-progressão do motor (suggestWeight segura a
  // carga quando a última sessão foi à falha). O array não era repassado, então a
  // trava existia no motor mas NUNCA recebia o dado — o peso subia mesmo depois de
  // uma série que estourou.
  const f = Array.isArray(item.setFailures) ? item.setFailures : []
  const n = Math.max(w.length, r.length)
  const out: HistorySet[] = []
  for (let i = 0; i < n; i++) {
    const weight = asNum(w[i])
    const reps = asNum(r[i])
    if (weight !== null && weight > 0 && reps !== null && reps > 0) {
      out.push({ weight, reps, rpe: asNum(rp[i]), failed: f[i] === true })
    }
  }
  return out
}

/**
 * Escolhe o histórico utilizável: percorre as sessões do exercício da mais recente
 * para a mais antiga e devolve a primeira que produza séries válidas.
 *
 * Existe porque pegar cegamente a sessão mais recente cegava o motor: bastava o
 * último treino daquele exercício ter sido PULADO (o motor prefila o peso, o usuário
 * não executa, então fica peso sem reps) para o histórico virar [] e o motor concluir
 * "nunca fizeram isso" — ignorando os treinos bons logo atrás. Caso real: Crucifixo
 * invertido na máquina, pulado em 27/07, sem sugestão nenhuma em 29/07.
 */
export function pickUsableHistory(
  items:
    | Array<Parameters<typeof buildHistorySets>[0] & { ts?: number; deloadApplied?: boolean }>
    | null
    | undefined,
): HistorySet[] {
  if (!Array.isArray(items) || !items.length) return []
  const ordered = [...items].sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0))

  // 1ª passada: sessões SEM deload. Carga de deload é baixa de propósito — usá-la
  // como referência faz o motor achar que o atleta regrediu, ancorar a trava
  // anti-regressão no peso reduzido e levar várias sessões (teto de +10% cada) pra
  // voltar ao patamar. Ou seja: quem faz um deload planejado era punido por isso.
  for (const item of ordered) {
    if (item?.deloadApplied) continue
    const sets = buildHistorySets(item)
    if (sets.length) return sets
  }

  // 2ª passada: se TODO o histórico disponível é de deload, é melhor calibrar por
  // ele do que não sugerir nada.
  for (const item of ordered) {
    const sets = buildHistorySets(item)
    if (sets.length) return sets
  }
  return []
}

/**
 * Extrai o sinal do dia por exercício: a série marcada como "Reconhecimento", já
 * concluída, com peso, reps E RPE preenchidos. Havendo mais de uma no exercício,
 * vence a de MAIOR carga — quanto mais perto da carga de trabalho, menor o erro da
 * extrapolação de e1RM.
 *
 * Exportada para o guard poder exercitar a regra sem montar a tela do treino.
 */
export function extractFeelerSignals(
  exercises: unknown[],
  logs: Record<string, unknown> | null | undefined,
): Record<number, FeelerSignal> {
  const out: Record<number, FeelerSignal> = {}
  if (!logs || typeof logs !== 'object') return out

  for (const [key, raw] of Object.entries(logs)) {
    const log = isObject(raw) ? raw : null
    if (!log) continue
    const parts = String(key || '').split('-')
    const exIdx = Number(parts[0])
    const setIdx = Number(parts[1])
    if (!Number.isFinite(exIdx) || !Number.isFinite(setIdx)) continue

    // Só série CONCLUÍDA conta: reconhecimento em andamento ainda não é medida.
    const doneRaw = log.done ?? log.isDone ?? log.completed ?? null
    const done = doneRaw === true || String(doneRaw ?? '').toLowerCase() === 'true'
    if (!done) continue

    // O tipo pode vir do log (override da sessão) ou do template. Usa a MESMA
    // resolução dos renderers — duplicar essa lógica é como essa família de
    // código acumula divergência silenciosa.
    const ex = isObject(exercises?.[exIdx]) ? (exercises[exIdx] as Record<string, unknown>) : null
    const details = Array.isArray(ex?.setDetails)
      ? (ex?.setDetails as unknown[])
      : Array.isArray(ex?.set_details)
        ? (ex?.set_details as unknown[])
        : []
    const planned = isObject(details[setIdx]) ? (details[setIdx] as Record<string, unknown>) : null
    const setType = resolveSetType({
      set_type: (log.set_type ?? planned?.set_type) as string | null | undefined,
      is_warmup: log.is_warmup ?? planned?.is_warmup,
    })
    if (setType !== 'feeler') continue

    const weight = extractLogWeight(log)
    const reps = extractLogReps(log)
    const rpe = extractLogRpe(log)
    // Opt-in do dono: sem RPE preenchido o sinal não é usado.
    if (weight == null || weight <= 0 || reps == null || reps <= 0 || rpe == null || rpe <= 0) continue

    const prev = out[exIdx]
    if (!prev || weight > prev.weight) out[exIdx] = { weight, reps, rpe }
  }

  return out
}

/** Chave canônica dos sinais — muda só quando um reconhecimento muda, não a cada tecla. */
function feelerSignalsKey(signals: Record<number, FeelerSignal>): string {
  return Object.keys(signals)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => `${i}:${signals[i].weight}:${signals[i].reps}:${signals[i].rpe}`)
    .join('|')
}

export function useWorkoutAutoload({ exercises, reportHistory, settings, userId, logs }: Params): {
  autoLoadEnabled: boolean
  autoLoadSuggestions: Record<string, AutoloadSuggestion>
} {
  const enabled = Boolean(settings?.autoLoadBeta) && Boolean(settings?.autoLoad)

  const [readiness, setReadiness] = useState<ReadinessToday | undefined>(undefined)

  // Prontidão de hoje: 1 fetch do check-in pré-treino mais recente do dia. One-shot,
  // sem listener → sem cleanup de realtime. Degrada em silêncio (motor lida com ausência).
  useEffect(() => {
    // Desligado: não busca. `readiness` remanescente é inofensivo — o useMemo abaixo
    // só usa quando `enabled` (e o effect refaz o fetch ao religar).
    if (!enabled || !userId) return
    let cancelled = false
    const run = async () => {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const supabase = createClient()
        const { data } = await supabase
          .from('workout_checkins')
          .select('energy, soreness, sleep_hours, created_at')
          .eq('user_id', userId)
          .eq('kind', 'pre')
          .gte('created_at', start.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        if (data) {
          setReadiness({
            energy: asNum(data.energy),
            soreness: asNum(data.soreness),
            sleepHours: asNum(data.sleep_hours),
          })
        } else {
          setReadiness(undefined)
        }
      } catch {
        if (!cancelled) setReadiness(undefined)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [enabled, userId])

  // Sinais do dia. Este memo é LEVE (varre ~30 logs) e roda a cada tecla, sem
  // problema. O memo pesado abaixo depende da CHAVE canônica, não deste objeto —
  // então recalcular todas as sugestões só acontece quando um Reconhecimento é
  // concluído/alterado. Depender de `logs` ali dispararia o motor inteiro a cada
  // dígito, num contexto que já é separado justamente por performance.
  const feelerSignals = useMemo(() => extractFeelerSignals(exercises, logs), [exercises, logs])
  const feelerKey = feelerSignalsKey(feelerSignals)
  const feelerSignalsRef = useRef(feelerSignals)
  feelerSignalsRef.current = feelerSignals

  const autoLoadSuggestions = useMemo<Record<string, AutoloadSuggestion>>(() => {
    if (!enabled || !Array.isArray(exercises) || !reportHistory) return {}
    const map: Record<string, AutoloadSuggestion> = {}

    exercises.forEach((exRaw, exIdx) => {
      if (!isRec(exRaw)) return
      const ex = exRaw
      const name = typeof ex.name === 'string' ? ex.name : ''
      if (!name.trim()) return

      const setsCount = Math.max(
        Number(ex.sets) || 0,
        Array.isArray(ex.setDetails) ? ex.setDetails.length : 0,
        Array.isArray(ex.set_details) ? (ex.set_details as unknown[]).length : 0,
      )
      if (setsCount <= 0) return

      const histEntry = reportHistory.exercises?.[normalizeExerciseKey(name)]
      // Percorre do mais recente pro mais antigo até achar uma sessão que produza
      // séries utilizáveis. Antes pegava `sort(...)[0]` cego: bastava a sessão mais
      // recente ter sido PULADA (peso prefilado pelo motor, sem reps) pra
      // `buildHistorySets` devolver [] e o motor concluir "sem histórico",
      // ignorando os treinos bons logo atrás. Uma sessão pulada apagava todo o
      // histórico anterior daquele exercício (caso real: Crucifixo invertido,
      // pulado em 27/07 → sem sugestão em 29/07).
      const ordered = histEntry?.items ?? []
      const history = pickUsableHistory(ordered)

      const feeler = feelerSignalsRef.current[exIdx]
      const suggestion = suggestWeight({
        history,
        targetReps: parseTopReps(ex.reps),
        targetRpe: parseRpe(ex.rpe),
        equipment: inferEquipmentFromName(name),
        readiness,
        todaySignal: feeler ? { weight: feeler.weight, reps: feeler.reps, rpe: feeler.rpe } : null,
      })

      // Motor ligado e mesmo assim sem sugestão: warning pesquisável no Sentry.
      // Esta saída era 100% silenciosa — nem tela, nem log —, então o modo de falha
      // que cegou o Crucifixo invertido só apareceu quando o dono estranhou na mão.
      // Toda saída silenciosa em caminho crítico é bomba-relógio (ver CLAUDE.md).
      if (suggestion.weight == null) {
        logWarnRemote('autoload:sem-sugestao', 'motor ligado não sugeriu carga', {
          exercise: name,
          historyItems: ordered.length,
          usableSets: history.length,
          rationale: suggestion.rationale,
        })
      }

      // Mesma sugestão de base para todas as séries do exercício (progressão é
      // por exercício na Fase 1). O normalSet decide preencher só séries de trabalho.
      for (let setIdx = 0; setIdx < setsCount; setIdx++) {
        map[`${exIdx}-${setIdx}`] = {
          weight: suggestion.weight,
          reps: suggestion.reps,
          confidence: suggestion.confidence,
          rationale: suggestion.rationale,
        }
      }
    })

    return map
  // `feelerKey` (string) no lugar de `feelerSignals` (objeto novo a cada render):
  // é o que impede o motor de recalcular a cada tecla digitada. O valor é lido do
  // ref, que está sempre atualizado quando a chave muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, exercises, reportHistory, readiness, feelerKey])

  return { autoLoadEnabled: enabled, autoLoadSuggestions }
}
