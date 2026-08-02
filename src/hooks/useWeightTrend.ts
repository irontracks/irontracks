'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { safePg } from '@/utils/safePgFilter'
import { logWarn } from '@/lib/logger'
import { buildWeightTrend, type WeightTrendPoint } from '@/utils/assessment/weightTrend'

/**
 * Série de peso ao longo do tempo, combinando avaliações + check-ins de treino.
 * Só LÊ (não escreve em `assessments`). Degrada gracioso: se a RLS não deixar ler
 * os check-ins de um aluno, cai só nos pesos das avaliações.
 */
export function useWeightTrend(studentId?: string | null): { points: WeightTrendPoint[]; loading: boolean } {
  const [points, setPoints] = useState<WeightTrendPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const supabase = createClient()
    ;(async () => {
      try {
        const uid = String(studentId || '').trim() || String((await supabase.auth.getUser()).data?.user?.id || '').trim()
        if (!uid) { if (alive) { setPoints([]); setLoading(false) }; return }

        const [checkinsRes, assessmentsRes] = await Promise.all([
          supabase
            .from('workout_checkins')
            .select('weight_kg, answers, created_at')
            .eq('user_id', uid)
            .eq('kind', 'pre')
            .order('created_at', { ascending: true })
            .limit(2000),
          supabase
            .from('assessments')
            .select('weight, date, assessment_date, created_at')
            .or(`user_id.eq.${safePg(uid)},student_id.eq.${safePg(uid)}`)
            .limit(500),
        ])

        if (!alive) return
        if (checkinsRes.error) logWarn('useWeightTrend', 'checkins fetch failed', checkinsRes.error)
        if (assessmentsRes.error) logWarn('useWeightTrend', 'assessments fetch failed', assessmentsRes.error)

        setPoints(buildWeightTrend(checkinsRes.data ?? [], assessmentsRes.data ?? []))
      } catch (e) {
        logWarn('useWeightTrend', 'unexpected', e)
        if (alive) setPoints([])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [studentId])

  return { points, loading }
}
