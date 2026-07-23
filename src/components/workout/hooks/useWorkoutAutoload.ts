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
function buildHistorySets(item: {
  setWeights?: (number | null)[] | null
  setReps?: (number | null)[] | null
  setRpes?: (number | null)[] | null
} | null | undefined): HistorySet[] {
  if (!item) return []
  const w = Array.isArray(item.setWeights) ? item.setWeights : []
  const r = Array.isArray(item.setReps) ? item.setReps : []
  const rp = Array.isArray(item.setRpes) ? item.setRpes : []
  const n = Math.max(w.length, r.length)
  const out: HistorySet[] = []
  for (let i = 0; i < n; i++) {
    const weight = asNum(w[i])
    const reps = asNum(r[i])
    if (weight !== null && weight > 0 && reps !== null && reps > 0) {
      out.push({ weight, reps, rpe: asNum(rp[i]) })
    }
  }
  return out
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
      const latest = histEntry?.items?.length
        ? [...histEntry.items].sort((a, b) => b.ts - a.ts)[0]
        : null
      const history = buildHistorySets(latest)

      const suggestion = suggestWeight({
        history,
        targetReps: parseTopReps(ex.reps),
        targetRpe: parseRpe(ex.rpe),
        equipment: inferEquipmentFromName(name),
        readiness,
      })

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
