'use client'
import { logWarn } from '@/lib/logger'
import { useRef, useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getMuscleMapWeek, getReportPreviousData } from '@/actions/workout-actions'
import { getKcalEstimate } from '@/utils/calories/kcalClient'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { MUSCLE_BY_ID } from '@/utils/muscleMapConfig'
import {
    normalizeExerciseKey,
    calculateTotalVolume,
} from '@/utils/report/formatters'

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
    } catch {
        return null
    }
}

const toDateMs = (v: unknown): number | null => {
    try {
        if (!v) return null
        const vObj = v && typeof v === 'object' ? (v as AnyObj) : null
        if (vObj?.toDate && typeof vObj.toDate === 'function') {
            const d = (vObj.toDate as () => unknown)()
            const ms = d instanceof Date ? d.getTime() : new Date(d as unknown as string | number | Date).getTime()
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
        const ms = new Date(v as unknown as string | number | Date).getTime()
        return Number.isFinite(ms) ? ms : null
    } catch {
        return null
    }
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

const getWeekStartIso = (date: Date) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    })
    const parts = formatter.formatToParts(date)
    const map = parts.reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value
        return acc
    }, {})
    const weekday = String(map.weekday || '').toLowerCase()
    const weekdayIndex =
        weekday === 'mon' ? 1 : weekday === 'tue' ? 2 : weekday === 'wed' ? 3 : weekday === 'thu' ? 4 : weekday === 'fri' ? 5 : weekday === 'sat' ? 6 : 0
    const y = Number(map.year)
    const m = Number(map.month)
    const d = Number(map.day) - ((weekdayIndex + 6) % 7)
    const base = new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
    return base.toISOString().slice(0, 10)
}

const extractExerciseLogsByIndex = (sessionObj: unknown, exIdx: number): unknown[] => {
    try {
        const base = sessionObj && typeof sessionObj === 'object' ? (sessionObj as AnyObj) : null
        const logs = base?.logs && typeof base.logs === 'object' ? (base.logs as Record<string, unknown>) : {}
        const out: unknown[] = []
        Object.keys(logs).forEach((key) => {
            const parts = String(key || '').split('-')
            const eIdx = Number(parts[0])
            const sIdx = Number(parts[1])
            if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx)) return
            if (eIdx !== exIdx) return
            out[sIdx] = logs[key]
        })
        return out
    } catch { return [] }
}

const hasAnyComparableLog = (logsArr: unknown): boolean => {
    try {
        const arr = Array.isArray(logsArr) ? logsArr : []
        for (const l of arr) {
            if (!l || typeof l !== 'object') continue
            const obj = l as AnyObj
            const w = Number(String(obj?.weight ?? '').replace(',', '.'))
            const r = Number(String(obj?.reps ?? '').replace(',', '.'))
            if ((Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)) return true
        }
        return false
    } catch { return false }
}

// ─── Canonical name helpers (exported for PDF handler) ───────────────────────

export const remapPrevLogsByCanonical = (prevLogsByExercise: unknown, canonicalMap: unknown): Record<string, unknown> => {
    try {
        const src = prevLogsByExercise && typeof prevLogsByExercise === 'object' ? (prevLogsByExercise as Record<string, unknown>) : {}
        const map = canonicalMap && typeof canonicalMap === 'object' ? (canonicalMap as Record<string, unknown>) : {}
        const out: Record<string, unknown> = {}
        Object.keys(src).forEach((k) => {
            const baseKey = String(k || '').trim()
            if (!baseKey) return
            const aliasNorm = normalizeExerciseName(baseKey)
            const canonicalName = String(map?.[aliasNorm] || baseKey).trim() || baseKey
            const nextKey = normalizeExerciseKey(canonicalName)
            if (!nextKey) return
            const logsArr = Array.isArray(src[k]) ? (src[k] as unknown[]) : []
            if (!out[nextKey]) { out[nextKey] = logsArr; return }
            const merged = Array.isArray(out[nextKey]) ? (out[nextKey] as unknown[]).slice() : []
            const maxLen = Math.max(merged.length, logsArr.length)
            for (let i = 0; i < maxLen; i += 1) {
                if (merged[i] == null && logsArr[i] != null) merged[i] = logsArr[i]
            }
            out[nextKey] = merged
        })
        return out
    } catch {
        return (prevLogsByExercise && typeof prevLogsByExercise === 'object') ? (prevLogsByExercise as Record<string, unknown>) : {}
    }
}

export const remapPrevBaseMsByCanonical = (prevBaseMsByExercise: unknown, canonicalMap: unknown): Record<string, unknown> => {
    try {
        const src = prevBaseMsByExercise && typeof prevBaseMsByExercise === 'object' ? (prevBaseMsByExercise as Record<string, unknown>) : {}
        const map = canonicalMap && typeof canonicalMap === 'object' ? (canonicalMap as Record<string, unknown>) : {}
        const out: Record<string, unknown> = {}
        Object.keys(src).forEach((k) => {
            const baseKey = String(k || '').trim()
            if (!baseKey) return
            const aliasNorm = normalizeExerciseName(baseKey)
            const canonicalName = String(map?.[aliasNorm] || baseKey).trim() || baseKey
            const nextKey = normalizeExerciseKey(canonicalName)
            if (!nextKey) return
            if (out[nextKey] == null) out[nextKey] = src[k]
        })
        return out
    } catch {
        return (prevBaseMsByExercise && typeof prevBaseMsByExercise === 'object') ? (prevBaseMsByExercise as Record<string, unknown>) : {}
    }
}

export const applyCanonicalNamesToSession = (sessionObj: unknown, canonicalMap: unknown): unknown => {
    try {
        const base = sessionObj && typeof sessionObj === 'object' ? (sessionObj as AnyObj) : null
        if (!base) return sessionObj
        const map = canonicalMap && typeof canonicalMap === 'object' ? (canonicalMap as AnyObj) : {}
        const exs = Array.isArray(base?.exercises) ? (base.exercises as unknown[]) : []
        if (!exs.length) return sessionObj
        const nextExercises = exs.map((ex: unknown) => {
            try {
                const exObj = ex && typeof ex === 'object' ? (ex as AnyObj) : ({} as AnyObj)
                const rawName = String(exObj?.name || '').trim()
                if (!rawName) return ex
                const aliasNorm = normalizeExerciseName(rawName)
                const canonicalName = String(map?.[aliasNorm] || rawName).trim()
                if (!canonicalName || canonicalName === rawName) return ex
                return { ...(exObj as AnyObj), name: canonicalName }
            } catch { return ex }
        })
        return { ...base, exercises: nextExercises }
    } catch { return sessionObj }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiState {
    loading: boolean
    error: string | null
    result: Record<string, unknown> | null
    cached: boolean
}

interface MuscleTrendState {
    status: 'idle' | 'loading' | 'ready' | 'error'
    data: null | { current: Record<string, number>; previous: Record<string, number> }
}

interface MuscleTrend4wState {
    status: 'idle' | 'loading' | 'ready' | 'error'
    data: null | { weeks: string[]; series: Record<string, number[]> }
}

interface ExerciseTrendState {
    status: 'idle' | 'loading' | 'ready' | 'error'
    data: null | { weeks: string[]; series: Array<{ name: string; values: number[] }> }
}

export interface ApplyState {
    status: 'idle' | 'loading' | 'success' | 'error'
    error: string
    templateId: string | null
}

interface UseReportDataParams {
    session: AnyObj | null
    previousSession?: AnyObj | null
    user: AnyObj | null
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
    // PR detection (Epley 1RM vs previous session)
    detectedPrs: Array<{ exerciseName: string; e1rm: number; prevE1rm: number }>
    prCount: number
    // Report meta
    reportMeta: AnyObj | null
    reportTotals: AnyObj | null
    reportRest: AnyObj | null
    reportWeekly: AnyObj | null
    reportLoadFlags: AnyObj | null
    // Previous logs per exercise
    prevLogsMap: Record<string, unknown>
    prevBaseMsMap: Record<string, unknown>
    // Trends
    muscleTrend: MuscleTrendState
    muscleTrend4w: MuscleTrend4wState
    exerciseTrend: ExerciseTrendState
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

export const useReportData = ({ session, previousSession, user }: UseReportDataParams): UseReportDataReturn => {
    const safeSession = session && typeof session === 'object' ? (session as AnyObj) : null

    // ── Supabase client ────────────────────────────────────────────────────
    const supabase = useMemo(() => {
        try { return createClient() } catch { return null }
    }, [])

    // ── PDF generation state ───────────────────────────────────────────────
    const [isGenerating, setIsGenerating] = useState(false)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
    const pdfFrameRef = useRef<HTMLIFrameElement | null>(null)

    // ── Previous session state ──────────────────────────────────────────
    const [resolvedPreviousSession, setResolvedPreviousSession] = useState<AnyObj | null>(null)

    // ── Per-exercise previous data ─────────────────────────────────────────
    const prevDataFetchRef = useRef(false)
    const [prevByExercise, setPrevByExercise] = useState<{ logsByExercise: Record<string, unknown>; baseMsByExercise: Record<string, unknown> }>({ logsByExercise: {}, baseMsByExercise: {} })

    // ── Check-ins ──────────────────────────────────────────────────────────
    const [checkinsByKind, setCheckinsByKind] = useState<{ pre: AnyObj | null; post: AnyObj | null }>({ pre: null, post: null })

    // ── AI state ───────────────────────────────────────────────────────────
    const [aiState, setAiState] = useState<AiState>(() => {
        const existing = session?.ai && typeof session.ai === 'object' ? (session.ai as AnyObj) : null
        return { loading: false, error: null, result: existing, cached: !!existing }
    })

    // ── Apply progression ──────────────────────────────────────────────────
    const [applyState, setApplyState] = useState<ApplyState>({ status: 'idle', error: '', templateId: null })

    // ── Trend states ───────────────────────────────────────────────────────
    const [muscleTrend, setMuscleTrend] = useState<MuscleTrendState>({ status: 'idle', data: null })
    const [muscleTrend4w, setMuscleTrend4w] = useState<MuscleTrend4wState>({ status: 'idle', data: null })
    const [exerciseTrend, setExerciseTrend] = useState<ExerciseTrendState>({ status: 'idle', data: null })

    // ── Kcal estimate ──────────────────────────────────────────────────────
    const [kcalEstimate, setKcalEstimate] = useState(0)

    // ── Target user id ─────────────────────────────────────────────────────
    const targetUserId = useMemo(() => {
        const candidates = [
            session?.user_id, session?.userId, session?.student_id,
            session?.studentId, session?.owner_id, session?.ownerId,
            user?.id, user?.uid
        ]
        const found = candidates.find((v) => typeof v === 'string' && v.trim())
        return found ? String(found) : null
    }, [session, user?.id, user?.uid])

    // ── Effect: Sync AI from session prop ──────────────────────────────────
    useEffect(() => {
        const existing = session?.ai && typeof session.ai === 'object' ? session.ai : null
        setAiState((prev) => {
            if (existing && typeof existing === 'object') return { ...prev, loading: false, error: null, result: existing as AnyObj, cached: true }
            return prev
        })
    }, [session])

    // ── Effect: afterprint listener ────────────────────────────────────────
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

    // ── Effect: Fetch check-ins ────────────────────────────────────────────
    useEffect(() => {
        const id = session?.id ? String(session.id) : ''
        if (!id || !supabase) { setCheckinsByKind({ pre: null, post: null }); return }
        const originWorkoutId = session?.originWorkoutId ? String(session.originWorkoutId) : ''
        const baseMs = toDateMs(session?.date) ?? toDateMs(session?.completed_at) ?? toDateMs(session?.completedAt) ?? (id ? Date.now() : null)
        const validBaseMs = typeof baseMs === 'number' && Number.isFinite(baseMs) ? baseMs : null
        const windowStartIso = validBaseMs ? new Date(validBaseMs - 12 * 60 * 60 * 1000).toISOString() : null
        const windowEndIso = validBaseMs ? new Date(validBaseMs + 2 * 60 * 60 * 1000).toISOString() : null
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase.from('workout_checkins')
                    .select('kind, energy, mood, soreness, notes, answers, created_at')
                    .eq('workout_id', id).order('created_at', { ascending: true }).limit(10)
                if (cancelled) return
                const rows = Array.isArray(data) ? data : []
                const next: { pre: AnyObj | null; post: AnyObj | null } = { pre: null, post: null }
                rows.forEach((r) => {
                    const row = r && typeof r === 'object' ? (r as AnyObj) : null
                    if (!row) return
                    const kind = String(row?.kind || '').trim()
                    if (kind === 'pre') next.pre = row
                    if (kind === 'post') next.post = row
                })
                if (!next.pre && originWorkoutId && targetUserId && windowStartIso && windowEndIso) {
                    try {
                        const { data: preRow } = await supabase.from('workout_checkins')
                            .select('kind, energy, mood, soreness, notes, answers, created_at')
                            .eq('user_id', targetUserId).eq('kind', 'pre')
                            .eq('planned_workout_id', originWorkoutId)
                            .gte('created_at', windowStartIso).lte('created_at', windowEndIso)
                            .order('created_at', { ascending: false }).limit(1).maybeSingle()
                        if (!cancelled && preRow) next.pre = preRow
                    } catch (e) { logWarn('useReportData', 'silenced error', e) }
                }
                setCheckinsByKind(next)
            } catch {
                if (!cancelled) setCheckinsByKind({ pre: null, post: null })
            }
        })()
        return () => { cancelled = true }
    }, [session?.id, session?.originWorkoutId, session?.date, session?.completed_at, session?.completedAt, supabase, targetUserId])

    // ── Effect: Consolidated previous session + per-exercise data (G1+G2) ──
    useEffect(() => {
        let cancelled = false
        if (!targetUserId || !session || typeof session !== 'object') return
        if (prevDataFetchRef.current) return
        if (previousSession) {
            // If previousSession was passed as prop, still resolve per-exercise data
            setResolvedPreviousSession(null)
        }
        const exercisesArr = Array.isArray(session?.exercises) ? session.exercises as unknown[] : []
        const exerciseNames = exercisesArr
            .map((ex: unknown) => String((ex as AnyObj)?.name || '').trim())
            .filter(Boolean)

        prevDataFetchRef.current = true;
        (async () => {
            try {
                const result = await getReportPreviousData({
                    userId: targetUserId,
                    currentSessionId: typeof session?.id === 'string' && session.id ? session.id : null,
                    currentDate: session?.date ? String(session.date) : null,
                    currentOriginId: session?.originWorkoutId ? String(session.originWorkoutId) : null,
                    currentTitle: session?.workoutTitle ? String(session.workoutTitle) : null,
                    exerciseNames,
                })
                if (cancelled) return
                if (!previousSession && result.previousSession) {
                    setResolvedPreviousSession(result.previousSession)
                }
                setPrevByExercise({
                    logsByExercise: result.prevLogsByExercise,
                    baseMsByExercise: result.prevBaseMsByExercise,
                })
            } catch {
                if (!cancelled) {
                    setPrevByExercise({ logsByExercise: {}, baseMsByExercise: {} })
                }
            } finally {
                prevDataFetchRef.current = false
            }
        })()
        return () => { cancelled = true }
    }, [session, previousSession, targetUserId])

    // ── Effect: Kcal estimate ──────────────────────────────────────────────
    useEffect(() => {
        if (!session) { setKcalEstimate(0); return }
        let cancelled = false;
        (async () => {
            try {
                const kcal = await getKcalEstimate({ session, workoutId: session?.id ?? null })
                if (cancelled) return
                if (Number.isFinite(Number(kcal)) && Number(kcal) > 0) setKcalEstimate(Math.round(Number(kcal)))
            } catch (e) { logWarn('useReportData', 'silenced error', e) }
        })()
        return () => { cancelled = true }
    }, [session])

    // ── Effect: Combined muscle trend (current vs prev) + 4w ──────────────
    useEffect(() => {
        let cancelled = false
        if (!session?.date) return
        const run = async () => {
            setMuscleTrend({ status: 'loading', data: null })
            setMuscleTrend4w({ status: 'loading', data: null })
            try {
                const base = new Date(String(session.date))
                const baseWeek = getWeekStartIso(base)
                // Generate 5 week dates: W0, W-1, W-2, W-3, W-4
                const weekDates: string[] = [0, 1, 2, 3, 4].map((idx) => {
                    const d = new Date(`${baseWeek}T00:00:00.000Z`)
                    d.setDate(d.getDate() - idx * 7)
                    return d.toISOString().slice(0, 10)
                })
                // Single batch fetch — 5 weeks in parallel
                const responses = await Promise.all(weekDates.map((weekStart) => getMuscleMapWeek({ weekStart })))
                if (cancelled) return
                const getMuscles = (res: unknown) => {
                    const r = res && typeof res === 'object' ? (res as AnyObj) : null
                    return (r?.ok && r?.muscles && typeof r.muscles === 'object') ? (r.muscles as Record<string, unknown>) : {}
                }
                // G3: muscleTrend — W0 vs W-1
                const curMuscles = getMuscles(responses[0])
                const prevMuscles = getMuscles(responses[1])
                const current = Object.fromEntries(Object.entries(curMuscles).map(([id, v]) => [id, Number((v as AnyObj)?.sets || 0)]))
                const previous = Object.fromEntries(Object.entries(prevMuscles).map(([id, v]) => [id, Number((v as AnyObj)?.sets || 0)]))
                setMuscleTrend({ status: 'ready', data: { current, previous } })
                // G4: muscleTrend4w — W0..W-3 (first 4 responses)
                const trend4wResponses = responses.slice(0, 4)
                const trend4wWeeks = weekDates.slice(0, 4)
                const series: Record<string, number[]> = {}
                Object.keys(MUSCLE_BY_ID).forEach((id) => {
                    series[id] = trend4wResponses.map((res) => {
                        const muscles = getMuscles(res)
                        const entry = muscles[id]
                        const sets = entry && typeof entry === 'object' ? Number((entry as AnyObj).sets || 0) : 0
                        return Number.isFinite(sets) ? sets : 0
                    }).reverse()
                })
                setMuscleTrend4w({ status: 'ready', data: { weeks: [...trend4wWeeks].reverse(), series } })
            } catch {
                if (!cancelled) {
                    setMuscleTrend({ status: 'error', data: null })
                    setMuscleTrend4w({ status: 'error', data: null })
                }
            }
        }
        run()
        return () => { cancelled = true }
    }, [session?.date])

    // ── Effect: Exercise trend ─────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        if (!session?.date || !supabase) return
        const run = async () => {
            setExerciseTrend({ status: 'loading', data: null })
            try {
                const base = new Date(String(session.date))
                const baseWeek = getWeekStartIso(base)
                const weekDates: string[] = [0, 1, 2, 3].map((idx) => {
                    const d = new Date(`${baseWeek}T00:00:00.000Z`)
                    d.setDate(d.getDate() - idx * 7)
                    return d.toISOString().slice(0, 10)
                })
                const startDate = new Date(`${weekDates[weekDates.length - 1]}T00:00:00.000Z`)
                const { data: rows } = await supabase.from('workouts')
                    .select('notes, date, created_at')
                    .eq('user_id', user?.id || '').eq('is_template', false)
                    .gte('date', startDate.toISOString()).order('date', { ascending: false }).limit(220)
                const sessions = (Array.isArray(rows) ? rows : [])
                    .map((row: AnyObj) => {
                        if (row?.notes && typeof row.notes === 'object') return row.notes as AnyObj
                        if (typeof row?.notes === 'string') return parseJsonWithSchema(row.notes, z.record(z.unknown()))
                        return null
                    })
                    .filter((s): s is AnyObj => Boolean(s && typeof s === 'object'))
                const reportMetaLocal = session?.reportMeta && typeof session.reportMeta === 'object' ? (session.reportMeta as AnyObj) : null
                const keyExercises = Array.isArray(reportMetaLocal?.exercises)
                    ? (reportMetaLocal?.exercises as Array<AnyObj>)
                        .map((e) => ({ name: String(e?.name || '').trim(), volume: Number((e?.volumeKg ?? 0) as number) || 0 }))
                        .filter((e) => e.name).sort((a, b) => b.volume - a.volume).slice(0, 4).map((e) => e.name)
                    : []
                if (!keyExercises.length) {
                    setExerciseTrend({ status: 'ready', data: { weeks: weekDates.reverse(), series: [] } })
                    return
                }
                const weekIndexByDate = new Map<string, number>()
                weekDates.forEach((w, idx) => weekIndexByDate.set(w, idx))
                const series = keyExercises.map((name) => ({ name, values: [0, 0, 0, 0] }))
                const normalizeKey = (value: string) => normalizeExerciseName(value).toLowerCase()
                const seriesByKey = new Map(series.map((s) => [normalizeKey(s.name), s]))

                const addToSeries = (sessionObj: AnyObj) => {
                    const dateRaw = sessionObj?.date ?? sessionObj?.created_at ?? null
                    const dateMs = dateRaw ? new Date(String(dateRaw)).getTime() : 0
                    if (!Number.isFinite(dateMs)) return
                    const weekStart = getWeekStartIso(new Date(dateMs))
                    const weekIdx = weekIndexByDate.get(weekStart)
                    if (weekIdx == null) return
                    const exercises = Array.isArray(sessionObj.exercises) ? (sessionObj.exercises as unknown[]) : []
                    const logs = sessionObj.logs && typeof sessionObj.logs === 'object' ? (sessionObj.logs as Record<string, unknown>) : {}
                    exercises.forEach((raw, exIdx) => {
                        if (!raw || typeof raw !== 'object') return
                        const exObj = raw as AnyObj
                        const name = String(exObj.name || '').trim()
                        if (!name) return
                        const key = normalizeKey(name)
                        const bucket = seriesByKey.get(key)
                        if (!bucket) return
                        let volume = 0
                        Object.entries(logs).forEach(([k, v]) => {
                            const parts = String(k || '').split('-')
                            const eIdx = Number(parts[0])
                            if (!Number.isFinite(eIdx) || eIdx !== exIdx) return
                            if (!v || typeof v !== 'object') return
                            const obj = v as AnyObj
                            const w = Number(String(obj.weight ?? '').replace(',', '.'))
                            const r = Number(String(obj.reps ?? '').replace(',', '.'))
                            if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return
                            volume += w * r
                        })
                        bucket.values[weekIdx] += volume
                    })
                }

                sessions.forEach(addToSeries)
                const normalizedSeries = series.map((s) => ({ name: s.name, values: s.values.map((v) => Math.round(v * 10) / 10).reverse() }))
                setExerciseTrend({ status: 'ready', data: { weeks: weekDates.reverse(), series: normalizedSeries } })
            } catch {
                if (!cancelled) setExerciseTrend({ status: 'error', data: null })
            }
        }
        run()
        return () => { cancelled = true }
    }, [session?.date, session?.reportMeta, supabase, user?.id])

    // ── Derived values ─────────────────────────────────────────────────────

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

    const calories = (() => {
        const ov = Number(kcalEstimate)
        if (Number.isFinite(ov) && ov > 0) return Math.round(ov)
        const bikeKcal = Number(outdoorBike?.caloriesKcal)
        if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
        // MET-based estimate — more physiologically accurate than linear volume formula
        // MET scale for weight training: 3.5 (light), 5.0 (moderate), 6.0 (vigorous)
        // Intensity proxy: avg weight per rep relative to typical loads
        if (durationInMinutes > 0) {
            const logEntries = Object.values(sessionLogs)
            const avgWeightPerRep = (() => {
                let totalW = 0, totalR = 0
                logEntries.forEach((v) => {
                    if (!v || typeof v !== 'object') return
                    const obj = v as AnyObj
                    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
                    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
                    if (w > 0 && r > 0) { totalW += w * r; totalR += r }
                })
                return totalR > 0 ? totalW / totalR : 0
            })()
            // Determine MET: <20 kg avg = light (3.5), <50 = moderate (5.0), >= 50 = vigorous (6.0)
            const met = avgWeightPerRep < 20 ? 3.5 : avgWeightPerRep < 50 ? 5.0 : 6.0
            // Assume 75 kg if body weight unavailable (common athlete estimate)
            const bodyWeightKg = 75
            const kcalMet = met * bodyWeightKg * (durationInMinutes / 60)
            if (Number.isFinite(kcalMet) && kcalMet > 0) return Math.round(kcalMet)
        }
        return 0
    })()

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
        } catch (e) { logWarn('useReportData', 'silenced error', e) }
        const out: Record<string, unknown> = {}
        if (effectivePreviousSession && Array.isArray(effectivePreviousSession?.exercises)) {
            const safePrevLogs = prevSessionLogs as Record<string, unknown>;
            (effectivePreviousSession.exercises as unknown[]).forEach((ex: unknown, exIdx: number) => {
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
        } catch (e) { logWarn('useReportData', 'silenced error', e) }
        return {}
    })()

    // ── Detect PRs (Epley 1RM per exercise, compared to previous session) ──────
    // Used by the highlights header to show "N PRs achieved in this workout"
    const { detectedPrs, prCount } = useMemo(() => {
        try {
            const exercises = Array.isArray(safeSession?.exercises) ? safeSession.exercises as unknown[] : []
            const prs: Array<{ exerciseName: string; e1rm: number; prevE1rm: number }> = []

            exercises.forEach((ex, exIdx) => {
                const exObj = ex && typeof ex === 'object' ? (ex as AnyObj) : null
                const exName = String(exObj?.name || '').trim()
                if (!exName) return

                let bestCurE1rm = 0
                let bestPrevE1rm = 0

                const setsCount = Number(exObj?.sets ?? 0) || 0
                const prevExLogs = (() => {
                    const key = exName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
                    const fromMap = (prevByExercise?.logsByExercise as Record<string, unknown>)?.[key]
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
                    prs.push({ exerciseName: exName, e1rm: bestCurE1rm, prevE1rm: bestPrevE1rm })
                }
            })

            return { detectedPrs: prs, prCount: prs.length }
        } catch {
            return { detectedPrs: [], prCount: 0 }
        }
    }, [safeSession?.exercises, sessionLogs, prevByExercise?.logsByExercise])

    // Absolute volume delta vs previous session (kg)
    const volumeDeltaAbs = prevVolume > 0 ? Math.round(currentVolume - prevVolume) : 0

    return {
        supabase,
        effectivePreviousSession,

        targetUserId,
        preCheckin: checkinsByKind.pre,
        postCheckin: checkinsByKind.post,
        aiState, setAiState,
        applyState, setApplyState,
        sessionLogs, currentVolume, volumeDelta, volumeDeltaAbs, calories, outdoorBike,
        reportMeta, reportTotals, reportRest, reportWeekly, reportLoadFlags,
        prevLogsMap, prevBaseMsMap,
        detectedPrs, prCount,
        muscleTrend, muscleTrend4w, exerciseTrend,
        isGenerating, setIsGenerating,
        pdfUrl, setPdfUrl, pdfBlob, setPdfBlob, pdfFrameRef,
    }
}
