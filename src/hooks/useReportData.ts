/**
 * @module useReportData
 *
 * Aggregates all data needed to render a post-workout report: session
 * logs, exercise volumes, calories burned estimate, muscle group
 * distribution, personal records, and formatted durations. Fetches
 * from Supabase and the kcal estimation API on mount.
 *
 * @param sessionId - ID of the completed workout session
 * @returns `{ reportData, loading, error }`
 */
'use client'
import { logWarn } from '@/lib/logger'
import { useRef, useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getKcalEstimate } from '@/utils/calories/kcalClient'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { normalizeExerciseKey, calculateTotalVolume } from '@/utils/report/formatters'
import { estimateCaloriesMet } from '@/utils/calories/metEstimate'
import { useCheckins } from './useCheckins'
import { usePreviousSessionData } from './usePreviousSessionData'
import { useMuscleTrends } from './useMuscleTrends'

// ── Canonical remapping helpers (pure utils, moved out of this hook) ───────────
// Re-exported here for backwards compatibility with existing consumers.
export {
  remapPrevLogsByCanonical,
  remapPrevBaseMsByCanonical,
  applyCanonicalNamesToSession,
} from '@/utils/report/canonicalRemapping'

// ─── Helpers (pure, no hooks) ────────────────────────────────────────────────

type AnyObj = Record<string, unknown>

const parseSessionNotes = (notes: unknown): AnyObj | null => {
  try {
    if (typeof notes === 'string') {
      const trimmed = notes.trim()
      if (!trimmed) return null
      return parseJsonWithSchema(trimmed, z.record(z.unknown()))
    }
    if (notes && typeof notes === 'object') return notes as AnyObj
    return null
  } catch { return null }
}

const toDateMs = (v: unknown): number | null => {
  try {
    if (!v) return null
    const vObj = v && typeof v === 'object' ? (v as AnyObj) : null
    if (vObj?.toDate && typeof vObj.toDate === 'function') {
      const d = (vObj.toDate as () => unknown)()
      const ms = d instanceof Date ? d.getTime() : new Date(d as string | number | Date).getTime()
      return Number.isFinite(ms) ? ms : null
    }
    if (v instanceof Date) {
      const ms = v.getTime()
      return Number.isFinite(ms) ? ms : null
    }
    if (vObj) {
      const seconds = Number(vObj?.seconds ?? vObj?._seconds ?? vObj?.sec ?? null)
      const nanos = Number(vObj?.nanoseconds ?? vObj?._nanoseconds ?? 0)
      if (Number.isFinite(seconds) && seconds > 0) {
        const ms = seconds * 1000 + Math.floor(nanos / 1e6)
        return Number.isFinite(ms) ? ms : null
      }
    }
    const ms = new Date(v as string | number | Date).getTime()
    return Number.isFinite(ms) ? ms : null
  } catch { return null }
}

const normalizeTitleKey = (v: unknown): string => {
  try { return String(v || '').trim().toLowerCase() } catch { return '' }
}

const computeMatchKey = (s: unknown): { originId: string | null; titleKey: string } => {
  if (!s || typeof s !== 'object') return { originId: null, titleKey: '' }
  const obj = s as AnyObj
  const originId = obj?.originWorkoutId ?? obj?.workoutId ?? null
  const titleKey = normalizeTitleKey(obj?.workoutTitle ?? obj?.name ?? '')
  return { originId: originId ? String(originId) : null, titleKey }
}



// ─── Types ────────────────────────────────────────────────────────────────────

/** State of the Gemini AI insights request for a post-workout report. */
export interface AiState {
  /** Whether the AI request is in-flight. */
  loading: boolean
  /** Error message, if the AI request failed. */
  error: string | null
  /** The AI result object (Gemini response), or `null` if not yet available. */
  result: Record<string, unknown> | null
  /** `true` when the result was loaded from the session cache rather than a live request. */
  cached: boolean
}

/** State of the "apply AI progression" action that writes changes to a template. */
export interface ApplyState {
  status: 'idle' | 'loading' | 'success' | 'error'
  error: string
  /** ID of the template being updated, `null` when idle. */
  templateId: string | null
}

interface UseReportDataParams {
  session: AnyObj | null
  previousSession?: AnyObj | null
  user: AnyObj | null
  settings?: AnyObj | null
}

export interface UseReportDataReturn {
  // Supabase
  supabase: ReturnType<typeof createClient> | null
  // Resolved previous session
  effectivePreviousSession: AnyObj | null

  // Target user
  targetUserId: string | null
  // Check-ins
  preCheckin: AnyObj | null
  postCheckin: AnyObj | null
  // AI
  aiState: AiState
  setAiState: React.Dispatch<React.SetStateAction<AiState>>
  // Apply progression
  applyState: ApplyState
  setApplyState: React.Dispatch<React.SetStateAction<ApplyState>>
  // Volumes & metrics
  sessionLogs: Record<string, unknown>
  currentVolume: number
  volumeDelta: number
  volumeDeltaAbs: number
  calories: number
  outdoorBike: AnyObj | null
  // Set completion
  setsCompleted: number
  setsPlanned: number
  setCompletionPct: number
  // PR detection — vs last session AND vs all-time
  detectedPrs: Array<{ exerciseName: string; e1rm: number; prevE1rm: number; isAllTimePr: boolean }>
  prCount: number
  allTimePrCount: number
  // Historical best e1RM per exercise (all-time)
  historicalBestE1rm: Record<string, number>
  // Report meta
  reportMeta: AnyObj | null
  reportTotals: AnyObj | null
  reportRest: AnyObj | null
  reportWeekly: AnyObj | null
  reportLoadFlags: AnyObj | null
  // Previous logs per exercise
  prevLogsMap: Record<string, unknown>
  prevBaseMsMap: Record<string, unknown>
  // Trends (delegated to useMuscleTrends)
  muscleTrend: ReturnType<typeof useMuscleTrends>['muscleTrend']
  muscleTrend4w: ReturnType<typeof useMuscleTrends>['muscleTrend4w']
  exerciseTrend: ReturnType<typeof useMuscleTrends>['exerciseTrend']
  // PDF generation state
  isGenerating: boolean
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>
  pdfUrl: string | null
  setPdfUrl: React.Dispatch<React.SetStateAction<string | null>>
  pdfBlob: Blob | null
  setPdfBlob: React.Dispatch<React.SetStateAction<Blob | null>>
  pdfFrameRef: React.MutableRefObject<HTMLIFrameElement | null>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Central data hook for post-workout report pages.
 *
 * Composes three specialised sub-hooks:
 * - {@link useCheckins}           — pre/post workout check-in data
 * - {@link usePreviousSessionData} — previous session logs + historical best e1RM
 * - {@link useMuscleTrends}        — muscle activation trends (current week, 4-week, per-exercise)
 *
 * Additional responsibilities handled directly:
 * - Volume & calorie calculations (MET-based + Kcal API)
 * - Set completion rate
 * - Client-side PR detection via Epley 1RM (see ADR 002 for rationale)
 * - PDF generation state (`isGenerating`, `pdfUrl`, `pdfBlob`, `pdfFrameRef`)
 * - AI insights state (`aiState`) and apply-progression state (`applyState`)
 *
 * @param params.session          - The completed workout session object
 * @param params.previousSession  - Optional previous session already known by the caller
 * @param params.user             - Authenticated user object (for `user.id`)
 */
export const useReportData = ({ session, previousSession, user, settings }: UseReportDataParams): UseReportDataReturn => {
  const safeSession = session && typeof session === 'object' ? (session as AnyObj) : null

  // ── Supabase client ──────────────────────────────────────────────────────
  const supabase = useMemo(() => {
    try { return createClient() } catch { return null }
  }, [])

  // ── PDF generation state ─────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const pdfFrameRef = useRef<HTMLIFrameElement | null>(null)

  // ── AI state ─────────────────────────────────────────────────────────────
  const [aiState, setAiState] = useState<AiState>(() => {
    const existing = session?.ai && typeof session.ai === 'object' ? (session.ai as AnyObj) : null
    return { loading: false, error: null, result: existing, cached: !!existing }
  })

  // ── Apply progression ────────────────────────────────────────────────────
  const [applyState, setApplyState] = useState<ApplyState>({ status: 'idle', error: '', templateId: null })

  // ── Kcal: no async state here (eliminates oscillation) ──────────────────
  // Calories are computed deterministically in useMemo below using all
  // available session + checkin data. No useState/useEffect for kcal.

  // ── Target user id ───────────────────────────────────────────────────────
  const targetUserId = useMemo(() => {
    const candidates = [
      session?.user_id, session?.userId, session?.student_id,
      session?.studentId, session?.owner_id, session?.ownerId,
      user?.id, user?.uid,
    ]
    const found = candidates.find((v) => typeof v === 'string' && v.trim())
    return found ? String(found) : null
  }, [session, user?.id, user?.uid])

  // ── Effect: Sync AI from session prop ───────────────────────────────────
  useEffect(() => {
    const existing = session?.ai && typeof session.ai === 'object' ? session.ai : null
    setAiState((prev) => {
      if (existing && typeof existing === 'object') return { ...prev, loading: false, error: null, result: existing as AnyObj, cached: true }
      return prev
    })
  }, [session])

  // ── Effect: afterprint listener ──────────────────────────────────────────
  useEffect(() => {
    const onAfterPrint = () => { setIsGenerating(false) }
    const onFocus = () => { setIsGenerating(false) }
    const onVisibility = () => { if (!document.hidden) setIsGenerating(false) }
    window.addEventListener('afterprint', onAfterPrint)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('afterprint', onAfterPrint)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // ── Fire-and-forget: API call for server logging only ───────────────────
  // Does NOT update any state. The displayed calories value is in useMemo below.
  const kcalApiCalledRef = useRef(false)
  useEffect(() => {
    if (!session || kcalApiCalledRef.current) return
    kcalApiCalledRef.current = true
    getKcalEstimate({ session, workoutId: session?.id ?? null, rpe: null }).catch(
      (e) => logWarn('useReportData', 'kcal api log failed', e)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  // ── Sub-hooks composition ────────────────────────────────────────────────

  const { preCheckin, postCheckin } = useCheckins({
    workoutId: session?.id as string | undefined,
    targetUserId,
    supabase,
    sessionDate: session?.date,
    sessionCompletedAt: session?.completed_at ?? session?.completedAt,
    originWorkoutId: session?.originWorkoutId as string | undefined,
  })

  const { resolvedPreviousSession, prevByExercise, historicalBestE1rm } = usePreviousSessionData({
    session: safeSession,
    previousSession,
    targetUserId,
  })

  const reportMetaForTrends = safeSession?.reportMeta && typeof safeSession.reportMeta === 'object'
    ? (safeSession.reportMeta as AnyObj) : null

  const { muscleTrend, muscleTrend4w, exerciseTrend } = useMuscleTrends({
    sessionDate: safeSession?.date as string | undefined,
    sessionReportMeta: reportMetaForTrends,
    userId: user?.id as string | undefined,
    supabase,
  })

  // ── Derived values ───────────────────────────────────────────────────────

  const effectivePreviousSession = (() => {
    if (!previousSession) return resolvedPreviousSession
    const prevUserId = previousSession?.user_id ?? previousSession?.userId ?? previousSession?.student_id ?? previousSession?.studentId ?? null
    if (prevUserId && targetUserId && String(prevUserId) !== String(targetUserId)) return resolvedPreviousSession
    return previousSession
  })()

  const sessionLogs: Record<string, unknown> = safeSession?.logs && typeof safeSession.logs === 'object' ? (safeSession.logs as Record<string, unknown>) : {}
  const prevSessionLogs: Record<string, unknown> = effectivePreviousSession?.logs && typeof effectivePreviousSession.logs === 'object' ? (effectivePreviousSession.logs as Record<string, unknown>) : {}
  const currentVolume = calculateTotalVolume(sessionLogs)
  const prevVolume = effectivePreviousSession ? calculateTotalVolume(prevSessionLogs) : 0
  const volumeDelta = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : 0
  const durationInMinutes = (Number(safeSession?.totalTime) || 0) / 60
  const outdoorBike = safeSession?.outdoorBike && typeof safeSession.outdoorBike === 'object' ? (safeSession.outdoorBike as AnyObj) : null

  // Body weight from pre-workout check-in (answers.body_weight_kg), falls back to 75 kg default
  const preCheckinAnswers = (() => {
    const pc = preCheckin && typeof preCheckin === 'object' ? (preCheckin as AnyObj) : null
    if (!pc) return null
    return pc?.answers && typeof pc.answers === 'object' ? (pc.answers as AnyObj) : null
  })()
  const checkinBodyWeightKg = (() => {
    // Priority: 1. check-in answers, 2. pre-checkin session weight, 3. profile bodyWeightKg
    const fromAnswers = Number(preCheckinAnswers?.body_weight_kg)
    if (Number.isFinite(fromAnswers) && fromAnswers >= 20 && fromAnswers <= 300) return fromAnswers
    const fromSession = Number((safeSession?.preCheckin as AnyObj)?.weight ?? (safeSession?.preCheckin as AnyObj)?.body_weight_kg)
    if (Number.isFinite(fromSession) && fromSession >= 20 && fromSession <= 300) return fromSession
    // Fallback: use profile bodyWeightKg for users who completed their profile (no need to ask weight at check-in)
    const fromProfile = Number(settings?.bodyWeightKg)
    if (Number.isFinite(fromProfile) && fromProfile >= 20 && fromProfile <= 300) return fromProfile
    return null
  })()

  // Exercise names for complexity factor calculation
  const sessionExerciseNames = (() => {
    if (!Array.isArray(safeSession?.exercises)) return null
    return (safeSession.exercises as unknown[])
      .map((ex) => {
        const e = ex && typeof ex === 'object' ? (ex as AnyObj) : null
        return String(e?.name || '').trim()
      })
      .filter(Boolean) as string[]
  })()

  // RPE from post-workout check-in (answers.rpe) — used to scale MET ±15%
  const postCheckinRpe = (() => {
    const pc = postCheckin && typeof postCheckin === 'object' ? (postCheckin as AnyObj) : null
    if (!pc) return null
    const answers = pc?.answers && typeof pc.answers === 'object' ? (pc.answers as AnyObj) : null
    const rpe = answers?.rpe ?? pc?.rpe
    const n = Number(rpe)
    return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null
  })()

  // ── Calories: deterministic useMemo — stable from first render ───────────
  // Uses two-factor MET (avg load + density), complexity factor, body weight,
  // active vs rest time split, and RPE multiplier. No async state involved.
  const calories = useMemo(() => {
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)

    // Prefer explicit exec/rest seconds from session over total duration
    const execSeconds = Number(safeSession?.executionTotalSeconds ?? safeSession?.execution_total_seconds ?? 0) || 0
    const restSecondsSession = Number(safeSession?.restTotalSeconds ?? safeSession?.rest_total_seconds ?? 0) || 0
    const totalTimeSeconds = Number(safeSession?.totalTime) || 0
    const execMinutesOverride = execSeconds > 0 ? execSeconds / 60 : null
    const restMinutesOverride = restSecondsSession > 0 ? restSecondsSession / 60 : null

    // Biological sex from user settings (improves calorie precision by ±10%)
    const biologicalSex = String(settings?.biologicalSex ?? 'not_informed') || 'not_informed'

    return estimateCaloriesMet(
      sessionLogs,
      durationInMinutes || (totalTimeSeconds / 60),
      checkinBodyWeightKg,
      sessionExerciseNames,
      postCheckinRpe,
      execMinutesOverride,
      restMinutesOverride,
      biologicalSex,
    )
  }, [sessionLogs, durationInMinutes, checkinBodyWeightKg, sessionExerciseNames, postCheckinRpe, outdoorBike, safeSession?.executionTotalSeconds, safeSession?.restTotalSeconds, safeSession?.totalTime, settings?.biologicalSex, settings?.bodyWeightKg])

  const reportMeta = safeSession?.reportMeta && typeof safeSession.reportMeta === 'object' ? (safeSession.reportMeta as AnyObj) : null
  const reportTotals = reportMeta?.totals && typeof reportMeta.totals === 'object' ? (reportMeta.totals as AnyObj) : null
  const reportRest = reportMeta?.rest && typeof reportMeta.rest === 'object' ? (reportMeta.rest as AnyObj) : null
  const reportWeekly = reportMeta?.weekly && typeof reportMeta.weekly === 'object' ? (reportMeta.weekly as AnyObj) : null
  const reportLoadFlags = reportMeta?.loadFlags && typeof reportMeta.loadFlags === 'object' ? (reportMeta.loadFlags as AnyObj) : null

  const prevLogsMap = (() => {
    try {
      const fromPerExercise = prevByExercise?.logsByExercise && typeof prevByExercise.logsByExercise === 'object'
        ? prevByExercise.logsByExercise : null
      if (fromPerExercise && Object.keys(fromPerExercise).length) return fromPerExercise
    } catch (e) { logWarn('useReportData', 'prevLogsMap from perExercise failed', e) }
    const out: Record<string, unknown> = {}
    if (effectivePreviousSession && Array.isArray(effectivePreviousSession?.exercises)) {
      const safePrevLogs = prevSessionLogs as Record<string, unknown>
        ; (effectivePreviousSession.exercises as unknown[]).forEach((ex: unknown, exIdx: number) => {
          const exObj = ex && typeof ex === 'object' ? (ex as AnyObj) : null
          if (!exObj) return
          const exName = String(exObj?.name || '').trim()
          const keyName = normalizeExerciseKey(exName)
          if (!keyName) return
          const exLogs: Array<Record<string, unknown>> = []
          Object.keys(safePrevLogs).forEach((key) => {
            try {
              const parts = String(key || '').split('-')
              const eIdx = Number(parts[0])
              const sIdx = Number(parts[1])
              if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx)) return
              if (eIdx !== exIdx) return
              const value = safePrevLogs[key]
              if (value && typeof value === 'object') exLogs[sIdx] = value as Record<string, unknown>
            } catch { return }
          })
          out[keyName] = exLogs
        })
    }
    return out
  })()

  const prevBaseMsMap = (() => {
    try {
      const m = prevByExercise?.baseMsByExercise && typeof prevByExercise.baseMsByExercise === 'object'
        ? prevByExercise.baseMsByExercise : null
      if (m && Object.keys(m).length) return m
    } catch (e) { logWarn('useReportData', 'prevBaseMsMap failed', e) }
    return {}
  })()

  // ── Set completion rate ──────────────────────────────────────────────────
  const { setsCompleted, setsPlanned, setCompletionPct } = useMemo(() => {
    try {
      const exercises = Array.isArray(safeSession?.exercises) ? safeSession.exercises as unknown[] : []
      let planned = 0
      let completed = 0
      exercises.forEach((ex, exIdx) => {
        const exObj = ex && typeof ex === 'object' ? (ex as AnyObj) : null
        const setCount = Number(exObj?.sets ?? 0) || 0
        planned += setCount
        for (let sIdx = 0; sIdx < setCount; sIdx++) {
          const key = `${exIdx}-${sIdx}`
          const log = sessionLogs[key]
          if (!log || typeof log !== 'object') continue
          const obj = log as AnyObj
          const w = Number(String(obj?.weight ?? '').replace(',', '.'))
          const r = Number(String(obj?.reps ?? '').replace(',', '.'))
          if ((w > 0 || r > 0)) completed++
        }
      })
      return {
        setsCompleted: completed,
        setsPlanned: planned,
        setCompletionPct: planned > 0 ? Math.round((completed / planned) * 100) : 0,
      }
    } catch {
      return { setsCompleted: 0, setsPlanned: 0, setCompletionPct: 0 }
    }
  }, [safeSession?.exercises, sessionLogs])

  // ── Detect PRs (Epley 1RM — client-side, real-time display) ────────────────
  //
  // INTENTIONAL DUAL IMPLEMENTATION:
  //   • This hook computes PRs client-side using Epley 1RM (w × (1 + r/30))
  //     for immediate display in the post-workout report without a network round-trip.
  //   • The API (e.g. /api/workout-report or Supabase RPC) independently validates
  //     and persists PRs to the database with additional business rules (cooldown
  //     periods, minimum weight thresholds, etc.).
  //
  // SOURCE OF TRUTH: the database values written by the API are canonical.
  // The values here are best-effort estimates for UX responsiveness only.
  // If the two diverge (e.g. a set was retroactively edited via the API),
  // the API result should be displayed preferentially whenever available.
  const { detectedPrs, prCount, allTimePrCount } = useMemo(() => {
    try {
      const exercises = Array.isArray(safeSession?.exercises) ? safeSession.exercises as unknown[] : []
      const prs: Array<{ exerciseName: string; e1rm: number; prevE1rm: number; isAllTimePr: boolean }> = []

      exercises.forEach((ex, exIdx) => {
        const exObj = ex && typeof ex === 'object' ? (ex as AnyObj) : null
        const exName = String(exObj?.name || '').trim()
        if (!exName) return

        let bestCurE1rm = 0
        let bestPrevE1rm = 0

        const setsCount = Number(exObj?.sets ?? 0) || 0
        const normalizedKey = exName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
        const prevExLogs = (() => {
          const fromMap = (prevByExercise?.logsByExercise as Record<string, unknown>)?.[normalizedKey]
          return Array.isArray(fromMap) ? fromMap : []
        })()

        for (let sIdx = 0; sIdx < setsCount; sIdx++) {
          const key = `${exIdx}-${sIdx}`
          const log = sessionLogs[key]
          if (!log || typeof log !== 'object') continue
          const logObj = log as AnyObj
          const cw = Number(String(logObj?.weight ?? '').replace(',', '.'))
          const cr = Number(String(logObj?.reps ?? '').replace(',', '.'))
          const curE1rm = (cw > 0 && cr > 0) ? cw * (1 + cr / 30) : 0
          if (curE1rm > bestCurE1rm) bestCurE1rm = curE1rm

          const prevLog = prevExLogs[sIdx]
          if (prevLog && typeof prevLog === 'object') {
            const pObj = prevLog as AnyObj
            const pw = Number(String(pObj?.weight ?? '').replace(',', '.'))
            const pr = Number(String(pObj?.reps ?? '').replace(',', '.'))
            const prevE1rm = (pw > 0 && pr > 0) ? pw * (1 + pr / 30) : 0
            if (prevE1rm > bestPrevE1rm) bestPrevE1rm = prevE1rm
          }
        }

        if (bestCurE1rm > 0 && bestCurE1rm > bestPrevE1rm) {
          const allTimeBest = historicalBestE1rm[normalizedKey] ?? 0
          const isAllTimePr = bestCurE1rm > allTimeBest
          prs.push({ exerciseName: exName, e1rm: bestCurE1rm, prevE1rm: bestPrevE1rm, isAllTimePr })
        }
      })

      return {
        detectedPrs: prs,
        prCount: prs.length,
        allTimePrCount: prs.filter(p => p.isAllTimePr).length,
      }
    } catch {
      return { detectedPrs: [], prCount: 0, allTimePrCount: 0 }
    }
  }, [safeSession?.exercises, sessionLogs, prevByExercise?.logsByExercise, historicalBestE1rm])

  // Absolute volume delta vs previous session (kg)
  const volumeDeltaAbs = prevVolume > 0 ? Math.round(currentVolume - prevVolume) : 0

  return {
    supabase,
    effectivePreviousSession,

    targetUserId,
    preCheckin,
    postCheckin,
    aiState, setAiState,
    applyState, setApplyState,
    sessionLogs, currentVolume, volumeDelta, volumeDeltaAbs, calories, outdoorBike,
    setsCompleted, setsPlanned, setCompletionPct,
    reportMeta, reportTotals, reportRest, reportWeekly, reportLoadFlags,
    prevLogsMap, prevBaseMsMap,
    detectedPrs, prCount, allTimePrCount, historicalBestE1rm,
    muscleTrend, muscleTrend4w, exerciseTrend,
    isGenerating, setIsGenerating,
    pdfUrl, setPdfUrl, pdfBlob, setPdfBlob, pdfFrameRef,
  }
}
