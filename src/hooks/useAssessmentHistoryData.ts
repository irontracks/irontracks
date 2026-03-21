'use client'

import React, { useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useAssessment } from '@/hooks/useAssessment'
import { generateAssessmentPlanAi } from '@/actions/workout-actions'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import { safePg } from '@/utils/safePgFilter'
import { isIosNative } from '@/utils/platform'

import {
  AssessmentRow,
  toPositiveNumberOrNull,
  getWeightKg,
  getBmrKcal,
  safeJsonParse,
  safeDateMs,
  safeDateMsStartOfDay,
  safeDateMsEndOfDay,
  countSessionSets,
  estimateStrengthTrainingMet,
  uniqueStrings,
} from '@/components/assessment/assessmentUtils'

import {
  buildAssessmentChartData,
  checkChartHasData,
  buildChartOptions,
  CHART_OPTIONS,
} from '@/components/assessment/assessmentChartData'

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const LOOKBACK_DAYS = 28
const BASE_ACTIVITY_FACTOR = 1.2
const TEF_FACTOR = 0.1
const MAX_SESSION_SECONDS = 4 * 60 * 60

// ────────────────────────────────────────────────────────────────
// AI Plan state type
// ────────────────────────────────────────────────────────────────

export type AiPlanEntry = {
  loading: boolean
  error: string | null
  plan: Record<string, unknown> | null
  usedAi: boolean
  reason?: string
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useAssessmentHistoryData(studentId?: string) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { getStudentAssessments, deleteAssessment } = useAssessment()

  // ── Core state ───────────────────────────────────────────────
  const [assessments, setAssessments] = useState<AssessmentRow[]>([])
  const [loading, setLoading] = useState(!!studentId)
  const [error, setError] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string>('Aluno')

  // ── Workout sessions (for TDEE) ──────────────────────────────
  const [workoutSessions, setWorkoutSessions] = useState<{ dateMs: number; metHours: number }[]>([])
  const [workoutSessionsLoading, setWorkoutSessionsLoading] = useState(false)

  // ── UI state ─────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedAssessment, setSelectedAssessment] = useState<string | null>(null)
  const [editAssessmentId, setEditAssessmentId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  // ── AI plan state ────────────────────────────────────────────
  const [aiPlanByAssessmentId, setAiPlanByAssessmentId] = useState<Record<string, AiPlanEntry>>({})
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [planModalAssessment, setPlanModalAssessment] = useState<AssessmentRow | null>(null)

  // ── Refs ──────────────────────────────────────────────────────
  const scanInputRef = useRef<HTMLInputElement | null>(null)
  const planAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const isIosNativeApp = isIosNative()

  // ── Merge helper for scan import ────────────────────────────
  const mergeImportedFormData = useCallback(
    (base: Record<string, unknown>, incoming: Record<string, unknown>) => {
      const out: Record<string, unknown> = { ...(base && typeof base === 'object' ? base : {}) }
      const keys = [
        'assessment_date', 'weight', 'height', 'age', 'gender',
        'arm_circ', 'chest_circ', 'waist_circ', 'hip_circ', 'thigh_circ', 'calf_circ',
        'triceps_skinfold', 'biceps_skinfold', 'subscapular_skinfold', 'suprailiac_skinfold',
        'abdominal_skinfold', 'thigh_skinfold', 'calf_skinfold', 'observations',
      ]
      keys.forEach((k) => {
        const nextVal = incoming?.[k]
        if (nextVal === undefined || nextVal === null || nextVal === '') return
        const prevVal = out?.[k]
        if (prevVal === undefined || prevVal === null || prevVal === '') {
          out[k] = nextVal
        }
      })
      return out
    },
    [],
  )

  // ── Handlers ─────────────────────────────────────────────────

  const handleDeleteAssessment = useCallback(
    async (assessmentId: string) => {
      try {
        setDeletingId(assessmentId)
        const result = await deleteAssessment(assessmentId)
        if (result.success) {
          setAssessments((prev) => prev.filter((a) => String(a?.id) !== assessmentId))
          setConfirmDeleteId(null)
          setSelectedAssessment(null)
        }
      } catch (e) {
        logError('error', 'Erro ao excluir avaliação', e)
      } finally {
        setDeletingId(null)
      }
    },
    [deleteAssessment],
  )

  const handleScanClick = useCallback(() => {
    if (!studentId) return
    if (!scanInputRef.current) return
    scanInputRef.current.click()
  }, [studentId])

  const handleScanFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const files = event.target.files ? Array.from(event.target.files) : []
        if (!files.length) return
        if (!studentId) return
        if (importing) return

        setImporting(true)

        let mergedFormData: Record<string, unknown> = {}

        for (const file of files) {
          const form = new FormData()
          form.append('file', file)

          const res = await fetch('/api/assessment-scanner', {
            method: 'POST',
            body: form,
          })

          const data = await res.json().catch((): null => null)
          if (!data || !data.ok) {
            const msg = String(data?.error || 'Falha ao processar arquivo')
            if (typeof window !== 'undefined') window.alert(msg)
            return
          }

          const nextForm =
            data?.formData && typeof data.formData === 'object'
              ? (data.formData as Record<string, unknown>)
              : null
          if (nextForm) mergedFormData = mergeImportedFormData(mergedFormData, nextForm)
        }

        const hasCoreField =
          mergedFormData &&
          typeof mergedFormData === 'object' &&
          ('weight' in mergedFormData || 'height' in mergedFormData || 'assessment_date' in mergedFormData)

        if (!hasCoreField) {
          if (typeof window !== 'undefined') {
            window.alert('Não foi possível extrair dados suficientes da avaliação.')
          }
          return
        }

        if (typeof window !== 'undefined') {
          try {
            const storageKey = `assessment_import_${studentId}`
            window.sessionStorage.setItem(storageKey, JSON.stringify({ formData: mergedFormData }))
          } catch (err) {
            logError('error', 'Erro ao salvar avaliação importada na sessão', err)
            window.alert('Não foi possível preparar os dados importados. Tente novamente.')
            return
          }
        }

        router.push(`/assessments/new/${studentId}`)
      } catch (err) {
        logError('error', 'Erro ao importar avaliação por imagem/PDF', err)
        if (typeof window !== 'undefined') {
          window.alert('Falha ao importar avaliação por imagem/PDF.')
        }
      } finally {
        setImporting(false)
        if (event.target) {
          event.target.value = ''
        }
      }
    },
    [studentId, importing, mergeImportedFormData, router],
  )

  const handleGenerateAssessmentPlan = useCallback(
    async (assessment: AssessmentRow, opts?: { openDetails?: boolean }) => {
      try {
        const id = String(assessment?.id || '')
        if (!id) return
        if (opts?.openDetails) setSelectedAssessment(id)

        setAiPlanByAssessmentId((prev) => ({
          ...prev,
          [id]: {
            loading: true,
            error: null,
            plan: prev[id]?.plan ?? null,
            usedAi: prev[id]?.usedAi ?? false,
            reason: prev[id]?.reason,
          },
        }))

        const res = await generateAssessmentPlanAi({
          assessment,
          studentName,
          trainerName: String(assessment?.trainer_name ?? ''),
          goal: String(assessment?.goal ?? assessment?.observations ?? ''),
        })

        if (!res || !res.ok) {
          setAiPlanByAssessmentId((prev) => ({
            ...prev,
            [id]: {
              loading: false,
              error: res?.error ? String(res.error) : 'Falha ao gerar plano tático',
              plan: prev[id]?.plan ?? null,
              usedAi: false,
              reason: res?.reason ? String(res.reason) : 'ai_failed',
            },
          }))
          return
        }

        setAiPlanByAssessmentId((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            error: null,
            plan: res.plan ?? null,
            usedAi: !!res.usedAi,
            reason: res?.reason ? String(res.reason) : res?.usedAi ? 'ai' : 'fallback',
          },
        }))
        setTimeout(() => {
          try {
            planAnchorRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } catch {}
        }, 50)
      } catch (e) {
        const id = String(assessment?.id || '')
        if (!id) return
        setAiPlanByAssessmentId((prev) => ({
          ...prev,
          [id]: {
            loading: false,
            error:
              (e as Record<string, unknown>)?.message
                ? String((e as Record<string, unknown>).message)
                : 'Erro inesperado ao gerar plano tático',
            plan: prev[id]?.plan ?? null,
            usedAi: false,
            reason: 'ai_failed',
          },
        }))
      }
    },
    [studentName],
  )

  const handleOpenAssessmentPlanModal = useCallback(
    async (assessment: AssessmentRow) => {
      try {
        const id = String(assessment?.id || '')
        if (!id) return
        setPlanModalAssessment(assessment)
        setPlanModalOpen(true)
        await handleGenerateAssessmentPlan(assessment, { openDetails: false })
      } catch {}
    },
    [handleGenerateAssessmentPlan],
  )

  // ── Computed data ────────────────────────────────────────────

  const sortedAssessments = useMemo(() => {
    const safeTime = (raw: unknown): number => {
      const date = new Date(
        typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date ? raw : String(raw ?? ''),
      )
      const time = date.getTime()
      return Number.isFinite(time) ? time : 0
    }

    return [...(assessments || [])].sort((a, b) => {
      const aTime = safeTime(a?.date ?? a?.assessment_date)
      const bTime = safeTime(b?.date ?? b?.assessment_date)
      return aTime - bTime
    })
  }, [assessments])

  const workoutWindow = useMemo(() => {
    if (!Array.isArray(sortedAssessments) || sortedAssessments.length === 0) return null
    const minTimes = sortedAssessments
      .map((a) => safeDateMsStartOfDay(a?.date ?? a?.assessment_date))
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0)
    const maxTimes = sortedAssessments
      .map((a) => safeDateMsEndOfDay(a?.date ?? a?.assessment_date))
      .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0)
    if (minTimes.length === 0 || maxTimes.length === 0) return null
    const minTime = Math.min(...minTimes)
    const maxTime = Math.max(...maxTimes)
    const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    return {
      from: new Date(minTime - lookbackMs),
      to: new Date(maxTime),
    }
  }, [sortedAssessments])

  const workoutWindowFromIso = workoutWindow?.from ? workoutWindow.from.toISOString() : null
  const workoutWindowToIso = workoutWindow?.to ? workoutWindow.to.toISOString() : null

  // ── Effect: Fetch assessments ────────────────────────────────
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!studentId) {
          if (mounted) setError('ID do aluno não fornecido.')
          return
        }
        if (mounted) {
          setError(null)
          setLoading(true)
        }
        const listRaw = await getStudentAssessments(studentId!)
        const list = Array.isArray(listRaw) ? (listRaw as unknown as AssessmentRow[]) : []
        if (mounted) setAssessments(list)
        if (mounted) {
          setError(null)
          const latest = list?.[0]
          if (latest?.student_name) {
            setStudentName(String(latest.student_name || 'Aluno'))
          } else {
            let resolvedName = 'Aluno'
            try {
              const { data: studentRow } = await supabase
                .from('students')
                .select('name, email, user_id')
                .eq('id', studentId!)
                .maybeSingle()

              if (studentRow) {
                resolvedName = studentRow.name || studentRow.email || resolvedName
              } else {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('display_name, email')
                  .eq('id', studentId!)
                  .maybeSingle()
                if (profile) {
                  resolvedName = profile.display_name || profile.email || resolvedName
                }
              }
            } catch (e) {
              logError('error', 'Erro ao resolver nome do aluno para histórico de avaliações', e)
            }

            setStudentName(resolvedName)
          }
        }
      } catch (e: unknown) {
        if (mounted) setError(getErrorMessage(e) || 'Erro ao carregar avaliações')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [studentId, getStudentAssessments, supabase])

  // ── Effect: Fetch workout sessions (for TDEE) ────────────────
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        if (!studentId || !workoutWindowFromIso || !workoutWindowToIso) {
          if (mounted) setWorkoutSessions([])
          return
        }
        if (mounted) setWorkoutSessionsLoading(true)

        const candidateId = String(studentId || '').trim()
        const candidateIds: string[] = []

        try {
          const { data: directProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', candidateId)
            .maybeSingle()

          if (directProfile?.id) {
            candidateIds.push(directProfile.id as string)
          } else {
            const { data: studentRow } = await supabase
              .from('students')
              .select('id, user_id, email')
              .or(`id.eq.${safePg(candidateId)},user_id.eq.${safePg(candidateId)}`)
              .maybeSingle()

            if (studentRow?.user_id) candidateIds.push(studentRow.user_id as string)
            if (!studentRow?.user_id && studentRow?.email) {
              const { data: profileByEmail } = await supabase
                .from('profiles')
                .select('id')
                .ilike('email', studentRow.email)
                .maybeSingle()
              if (profileByEmail?.id) candidateIds.push(profileByEmail.id as string)
            }
          }
        } catch {
          candidateIds.push(candidateId)
        }

        const ids = uniqueStrings([candidateId, ...candidateIds])
        if (ids.length === 0) {
          if (mounted) setWorkoutSessions([])
          return
        }

        const baseSelect = 'id, user_id, student_id, date, created_at, completed_at, is_template, notes'
        const fromIso = workoutWindowFromIso
        const toIso = workoutWindowToIso
        const fromDay = typeof fromIso === 'string' ? fromIso.split('T')[0] : null
        const toDay = typeof toIso === 'string' ? toIso.split('T')[0] : null

        const rows: AssessmentRow[] = []
        try {
          const { data, error: wErr } = await supabase
            .from('workouts')
            .select(baseSelect)
            .eq('is_template', false)
            .in('user_id', ids)
            .gte('completed_at', fromIso)
            .lte('completed_at', toIso)
            .order('completed_at', { ascending: true })
          if (!wErr && Array.isArray(data)) rows.push(...data)
        } catch {}

        try {
          const { data, error: wErr } = await supabase
            .from('workouts')
            .select(baseSelect)
            .eq('is_template', false)
            .in('student_id', ids)
            .gte('completed_at', fromIso)
            .lte('completed_at', toIso)
            .order('completed_at', { ascending: true })
          if (!wErr && Array.isArray(data)) rows.push(...data)
        } catch {}

        if (fromDay && toDay) {
          try {
            const { data, error: wErr } = await supabase
              .from('workouts')
              .select(baseSelect)
              .eq('is_template', false)
              .in('user_id', ids)
              .gte('date', fromDay)
              .lte('date', toDay)
              .order('date', { ascending: true })
            if (!wErr && Array.isArray(data)) rows.push(...data)
          } catch {}

          try {
            const { data, error: wErr } = await supabase
              .from('workouts')
              .select(baseSelect)
              .eq('is_template', false)
              .in('student_id', ids)
              .gte('date', fromDay)
              .lte('date', toDay)
              .order('date', { ascending: true })
            if (!wErr && Array.isArray(data)) rows.push(...data)
          } catch {}
        }

        const byId = new Map<string, AssessmentRow>()
        for (const r of rows) {
          if (r?.id) byId.set(String(r.id), r)
        }

        const sessions: { dateMs: number; metHours: number }[] = []
        byId.forEach((r) => {
          const dateMs = safeDateMs(r?.completed_at ?? r?.date ?? r?.created_at)
          if (!dateMs) return
          const parsed = safeJsonParse(r?.notes)
          const totalTime = toPositiveNumberOrNull(parsed?.totalTime)
          const realTime = toPositiveNumberOrNull(parsed?.realTotalTime)
          let rawSeconds = totalTime || realTime || null
          if (!rawSeconds) {
            try {
              const exerciseDurations = Array.isArray(parsed?.exerciseDurations)
                ? (parsed.exerciseDurations as unknown[])
                : Array.isArray(parsed?.exercisesDurations)
                  ? (parsed.exercisesDurations as unknown[])
                  : null
              if (exerciseDurations && exerciseDurations.length > 0) {
                const sum = exerciseDurations.reduce<number>((acc: number, v: unknown) => acc + (Number(v) || 0), 0)
                if (Number.isFinite(sum) && sum > 0) rawSeconds = sum
              }
            } catch {}
          }
          if (!rawSeconds) return
          const seconds = Math.min(rawSeconds, MAX_SESSION_SECONDS)
          if (!Number.isFinite(seconds) || seconds <= 0) return
          const setsCount = countSessionSets(parsed || {})
          const met = estimateStrengthTrainingMet(seconds, setsCount)
          const metHours = (met * seconds) / 3600
          if (!Number.isFinite(metHours) || metHours <= 0) return
          sessions.push({ dateMs, metHours })
        })

        sessions.sort((a, b) => a.dateMs - b.dateMs)

        if (mounted) setWorkoutSessions(sessions)
      } catch {
        if (mounted) setWorkoutSessions([])
      } finally {
        if (mounted) setWorkoutSessionsLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [studentId, supabase, workoutWindowFromIso, workoutWindowToIso])

  // ── TDEE computation ─────────────────────────────────────────

  const tdeeByAssessmentId = useMemo(() => {
    const out = new Map<string, number>()
    if (!Array.isArray(sortedAssessments) || sortedAssessments.length === 0) return out

    const sessions = Array.isArray(workoutSessions) ? workoutSessions : []

    const dates = sessions.map((s) => s.dateMs)
    const prefix: number[] = new Array(sessions.length + 1)
    prefix[0] = 0
    for (let i = 0; i < sessions.length; i++) {
      prefix[i + 1] = prefix[i] + (Number(sessions[i]?.metHours) || 0)
    }

    const lowerBound = (arr: number[], x: number): number => {
      let lo = 0
      let hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (arr[mid] < x) lo = mid + 1
        else hi = mid
      }
      return lo
    }

    const upperBound = (arr: number[], x: number): number => {
      let lo = 0
      let hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (arr[mid] <= x) lo = mid + 1
        else hi = mid
      }
      return lo
    }

    const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    for (const assessment of sortedAssessments) {
      const id = assessment?.id ? String(assessment.id) : ''
      if (!id) continue
      const dateMs = safeDateMsEndOfDay(assessment?.date ?? assessment?.assessment_date)
      if (!dateMs) continue

      const bmr = getBmrKcal(assessment)
      const weightKg = getWeightKg(assessment)
      if (!bmr || !weightKg) continue

      let eatPerDay = 0
      if (sessions.length > 0) {
        const start = dateMs - lookbackMs
        const l = lowerBound(dates, start)
        const r = upperBound(dates, dateMs)
        const sumMetHours = prefix[r] - prefix[l]
        const eatTotal = weightKg * sumMetHours
        eatPerDay = eatTotal / LOOKBACK_DAYS
        if (!Number.isFinite(eatPerDay) || eatPerDay < 0) eatPerDay = 0
      }

      const baseline = bmr * BASE_ACTIVITY_FACTOR
      const totalBeforeTef = baseline + eatPerDay
      const tdee = totalBeforeTef * (1 + TEF_FACTOR)

      if (Number.isFinite(tdee) && tdee > 0) out.set(id, tdee)
    }

    return out
  }, [sortedAssessments, workoutSessions])

  // ── Chart data ───────────────────────────────────────────────

  // Chart.js dataset types from assessmentChartData — kept as AssessmentChartData
  const chartData = useMemo(() => buildAssessmentChartData(sortedAssessments), [sortedAssessments])
  const chartHasData = useMemo(() => checkChartHasData(chartData), [chartData])
  const chartOptions = useMemo(() => buildChartOptions(chartData), [chartData])

  const latestAssessment = sortedAssessments[sortedAssessments.length - 1]
  const previousAssessment = sortedAssessments[sortedAssessments.length - 2]

  // ── Return ───────────────────────────────────────────────────

  return {
    // Core data
    assessments,
    loading,
    error,
    studentName,
    sortedAssessments,
    latestAssessment,
    previousAssessment,

    // Workout sessions / TDEE
    workoutSessionsLoading,
    tdeeByAssessmentId,

    // Chart data
    chartData,
    chartHasData,
    chartOptions,

    // UI state
    showForm,
    setShowForm,
    showHistory,
    setShowHistory,
    selectedAssessment,
    setSelectedAssessment,
    editAssessmentId,
    setEditAssessmentId,
    deletingId,
    confirmDeleteId,
    setConfirmDeleteId,
    importing,

    // AI plan
    aiPlanByAssessmentId,
    planModalOpen,
    setPlanModalOpen,
    planModalAssessment,

    // Refs
    scanInputRef,
    planAnchorRefs,
    isIosNativeApp,

    // Handlers
    handleDeleteAssessment,
    handleScanClick,
    handleScanFileChange,
    handleGenerateAssessmentPlan,
    handleOpenAssessmentPlanModal,
  }
}
