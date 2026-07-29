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
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { ReportHistory } from '../types'
import { normalizeExerciseKey } from '../utils'
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
  items: Array<Parameters<typeof buildHistorySets>[0] & { ts?: number }> | null | undefined,
): HistorySet[] {
  if (!Array.isArray(items) || !items.length) return []
  const ordered = [...items].sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0))
  for (const item of ordered) {
    const sets = buildHistorySets(item)
    if (sets.length) return sets
  }
  return []
}

export function useWorkoutAutoload({ exercises, reportHistory, settings, userId }: Params): {
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

      const suggestion = suggestWeight({
        history,
        targetReps: parseTopReps(ex.reps),
        targetRpe: parseRpe(ex.rpe),
        equipment: inferEquipmentFromName(name),
        readiness,
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
  }, [enabled, exercises, reportHistory, readiness])

  return { autoLoadEnabled: enabled, autoLoadSuggestions }
}
