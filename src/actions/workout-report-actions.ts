import { createClient } from '@/utils/supabase/client'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

// ─── Private helpers ──────────────────────────────────────────────────────────

const normalizeExerciseKey = (v: unknown): string =>
    String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

const parseNotesField = (notes: unknown): Record<string, unknown> | null => {
    try {
        if (typeof notes === 'string') {
            const trimmed = notes.trim()
            if (!trimmed) return null
            return parseJsonWithSchema(trimmed, z.record(z.unknown()))
        }
        if (notes && typeof notes === 'object') return notes as Record<string, unknown>
        return null
    } catch { return null }
}

const extractDateMs = (v: unknown): number | null => {
    try {
        if (!v) return null
        if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null
        const ms = new Date(v as string | number | Date).getTime()
        return Number.isFinite(ms) ? ms : null
    } catch { return null }
}

const extractLogsByExIdx = (parsed: Record<string, unknown>, exIdx: number): unknown[] => {
    try {
        const logs = parsed?.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, unknown>) : {}
        const out: unknown[] = []
        for (const key of Object.keys(logs)) {
            const parts = key.split('-')
            const eIdx = Number(parts[0])
            const sIdx = Number(parts[1])
            if (!Number.isFinite(eIdx) || !Number.isFinite(sIdx) || eIdx !== exIdx) continue
            out[sIdx] = logs[key]
        }
        return out
    } catch { return [] }
}

const hasComparableLog = (logsArr: unknown[]): boolean => {
    for (const l of logsArr) {
        if (!l || typeof l !== 'object') continue
        const obj = l as Record<string, unknown>
        const w = Number(String(obj?.weight ?? '').replace(',', '.'))
        const r = Number(String(obj?.reps ?? '').replace(',', '.'))
        if ((Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)) return true
    }
    return false
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ReportPreviousParams {
    userId: string
    currentSessionId: string | null
    currentDate: string | null
    currentOriginId: string | null
    currentTitle: string | null
    exerciseNames: string[]
}

export interface ReportPreviousResult {
    previousSession: Record<string, unknown> | null
    prevLogsByExercise: Record<string, unknown>
    prevBaseMsByExercise: Record<string, number>
}

// ─── Exported report actions ──────────────────────────────────────────────────

export async function getReportPreviousData(params: ReportPreviousParams): Promise<ReportPreviousResult> {
    const empty: ReportPreviousResult = { previousSession: null, prevLogsByExercise: {}, prevBaseMsByExercise: {} }
    try {
        const { userId, currentSessionId, currentDate, currentOriginId, currentTitle, exerciseNames } = params
        if (!userId) return empty
        const supabase = createClient()

        let query = supabase.from('workouts').select('id, date, created_at, notes, name')
            .eq('user_id', userId).eq('is_template', false)
            .order('date', { ascending: false }).limit(200)
        if (currentSessionId) query = query.neq('id', currentSessionId)
        const { data: rows, error } = await query
        if (error) return empty
        const candidates = Array.isArray(rows) ? rows : []

        const currentMs = extractDateMs(currentDate)
        const currentOriginIdStr = currentOriginId ? String(currentOriginId) : null
        const currentTitleKey = currentTitle ? String(currentTitle).trim().toLowerCase() : ''

        const wantedExercises = new Map<string, string>()
        for (const name of exerciseNames) {
            const trimmed = String(name || '').trim()
            if (!trimmed) continue
            const key = normalizeExerciseKey(trimmed)
            if (key && !wantedExercises.has(key)) wantedExercises.set(key, trimmed)
        }
        const remainingExercises = new Set(Array.from(wantedExercises.keys()))

        let bestPreviousSession: Record<string, unknown> | null = null
        let bestPreviousMs = -1
        const resolvedLogs: Record<string, unknown> = {}
        const resolvedBaseMs: Record<string, number> = {}

        for (const r of candidates) {
            if (!r || typeof r !== 'object') continue
            const parsed = parseNotesField((r as Record<string, unknown>).notes)
            if (!parsed) continue
            const candidateMs = extractDateMs(parsed?.date) ?? extractDateMs((r as Record<string, unknown>)?.date) ?? extractDateMs((r as Record<string, unknown>)?.created_at) ?? null
            if (typeof candidateMs !== 'number' || !Number.isFinite(candidateMs)) continue
            if (typeof currentMs === 'number' && Number.isFinite(currentMs) && candidateMs >= currentMs) continue

            if (!bestPreviousSession) {
                const candOrigin = parsed?.originWorkoutId ?? parsed?.workoutId ?? null
                const candTitle = String(parsed?.workoutTitle ?? parsed?.name ?? '').trim().toLowerCase()
                const originMatch = !!(currentOriginIdStr && candOrigin && String(candOrigin) === currentOriginIdStr)
                const titleMatch = !!(currentTitleKey && candTitle && currentTitleKey === candTitle)
                if (originMatch || titleMatch) {
                    if (candidateMs > bestPreviousMs) {
                        const candLogs = parsed?.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, unknown>) : {}
                        const hasRealLogs = Object.values(candLogs).some((v) => {
                            if (!v || typeof v !== 'object') return false
                            const obj = v as Record<string, unknown>
                            const w = Number(String(obj?.weight ?? '').replace(',', '.'))
                            const r = Number(String(obj?.reps ?? '').replace(',', '.'))
                            return (Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)
                        })
                        if (hasRealLogs) {
                            bestPreviousMs = candidateMs
                            bestPreviousSession = { ...parsed, id: parsed?.id ?? (r as Record<string, unknown>)?.id ?? null }
                        }
                    }
                }
            }

            if (remainingExercises.size > 0) {
                const exArr = Array.isArray(parsed?.exercises) ? parsed.exercises as unknown[] : []
                for (let exIdx = 0; exIdx < exArr.length; exIdx++) {
                    if (!remainingExercises.size) break
                    const ex = exArr[exIdx]
                    if (!ex || typeof ex !== 'object') continue
                    const exName = String((ex as Record<string, unknown>)?.name || '').trim()
                    if (!exName) continue
                    const key = normalizeExerciseKey(exName)
                    if (!key || !remainingExercises.has(key)) continue
                    const logs = extractLogsByExIdx(parsed, exIdx)
                    if (!hasComparableLog(logs)) continue
                    resolvedLogs[key] = logs
                    resolvedBaseMs[key] = candidateMs
                    remainingExercises.delete(key)
                }
            }

            if (bestPreviousSession && remainingExercises.size === 0) break
        }

        return { previousSession: bestPreviousSession, prevLogsByExercise: resolvedLogs, prevBaseMsByExercise: resolvedBaseMs }
    } catch {
        return empty
    }
}

export async function getHistoricalBestE1rm(params: {
    userId: string
    currentSessionId: string | null
    exerciseNames: string[]
}): Promise<Record<string, number>> {
    const empty: Record<string, number> = {}
    try {
        const { userId, currentSessionId, exerciseNames } = params
        if (!userId || !exerciseNames.length) return empty
        const supabase = createClient()

        let query = supabase
            .from('workouts')
            .select('id, notes')
            .eq('user_id', userId)
            .eq('is_template', false)
            .order('date', { ascending: false })
            .limit(100)
        if (currentSessionId) query = query.neq('id', currentSessionId)
        const { data: rows, error } = await query
        if (error || !Array.isArray(rows)) return empty

        const normalize = (name: string) =>
            name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

        const wantedKeys = new Set(exerciseNames.map((n) => normalize(String(n || '').trim())).filter(Boolean))
        const bestE1rm: Record<string, number> = {}

        for (const row of rows) {
            if (!row || typeof row !== 'object') continue
            const parsed = parseNotesField((row as Record<string, unknown>).notes)
            if (!parsed) continue
            const exercises = Array.isArray(parsed?.exercises) ? (parsed.exercises as unknown[]) : []
            const logs = parsed?.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, unknown>) : {}

            exercises.forEach((ex, exIdx) => {
                if (!ex || typeof ex !== 'object') return
                const exName = String((ex as Record<string, unknown>)?.name || '').trim()
                if (!exName) return
                const key = normalize(exName)
                if (!wantedKeys.has(key)) return

                Object.entries(logs).forEach(([k, v]) => {
                    const parts = k.split('-')
                    const eIdx = Number(parts[0])
                    if (!Number.isFinite(eIdx) || eIdx !== exIdx) return
                    if (!v || typeof v !== 'object') return
                    const obj = v as Record<string, unknown>
                    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
                    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
                    if (w <= 0 || r <= 0 || !Number.isFinite(w) || !Number.isFinite(r)) return
                    const e1rm = w * (1 + r / 30)
                    if (!Number.isFinite(e1rm)) return
                    if (!bestE1rm[key] || e1rm > bestE1rm[key]) bestE1rm[key] = e1rm
                })
            })
        }

        return bestE1rm
    } catch {
        return empty
    }
}
