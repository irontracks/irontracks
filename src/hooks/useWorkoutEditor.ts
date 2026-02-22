'use client'

import { useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import type { Exercise } from '@/types/app'

interface UseWorkoutEditorOptions {
    supabase: SupabaseClient
}

interface UseWorkoutEditorReturn {
    resolveExerciseVideos: (exercises: unknown) => Promise<{
        exercises: Array<Record<string, unknown>>
        updates: Array<Record<string, unknown>>
    }>
    persistExerciseVideoUrls: (updates: unknown) => Promise<void>
    generateExerciseKey: () => string
    normalizeWorkoutForEditor: (raw: unknown) => Record<string, unknown>
    stripWorkoutInternalKeys: (workout: unknown) => unknown
    reindexSessionLogsAfterWorkoutEdit: (
        oldWorkout: unknown,
        newWorkout: unknown,
        logs: unknown
    ) => unknown
}

export function useWorkoutEditor({ supabase }: UseWorkoutEditorOptions): UseWorkoutEditorReturn {

    const resolveExerciseVideos = useCallback(
        async (exercises: unknown): Promise<{
            exercises: Array<Record<string, unknown>>
            updates: Array<Record<string, unknown>>
        }> => {
            try {
                const list = Array.isArray(exercises) ? (exercises as unknown[]) : []
                const exercisesList = list.map((ex) =>
                    ex && typeof ex === 'object'
                        ? (ex as Record<string, unknown>)
                        : ({} as Record<string, unknown>)
                )
                const missingNames = exercisesList
                    .map((exercise: Record<string, unknown>) => {
                        const name = String(exercise?.name || '').trim()
                        if (!name) return null
                        const current = String(
                            exercise?.videoUrl ?? exercise?.video_url ?? ''
                        ).trim()
                        if (current) return null
                        return name
                    })
                    .filter(Boolean)

                const uniqueNames = Array.from(new Set(missingNames)).slice(0, 80)
                if (!uniqueNames.length) return { exercises: exercisesList, updates: [] }

                const res = await fetch('/api/exercise-library/resolve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ names: uniqueNames }),
                })
                const json = await res.json().catch(() => ({}))
                if (!json?.ok) return { exercises: exercisesList, updates: [] }

                const videos =
                    json?.videos && typeof json.videos === 'object'
                        ? (json.videos as Record<string, unknown>)
                        : {}
                const updates: Array<Record<string, unknown>> = []
                const next = exercisesList.map((exercise: Record<string, unknown>) => {
                    const current = String(
                        exercise?.videoUrl ?? exercise?.video_url ?? ''
                    ).trim()
                    if (current) return exercise
                    const normalized = normalizeExerciseName(String(exercise?.name || ''))
                    const url = normalized ? String(videos[normalized] || '').trim() : ''
                    if (!url) return exercise
                    if (exercise?.id) updates.push({ id: exercise.id, url })
                    return { ...exercise, videoUrl: url, video_url: url }
                })

                return { exercises: next, updates }
            } catch {
                const safe = Array.isArray(exercises) ? (exercises as unknown[]) : []
                const list = safe.map((ex) =>
                    ex && typeof ex === 'object'
                        ? (ex as Record<string, unknown>)
                        : ({} as Record<string, unknown>)
                )
                return { exercises: list, updates: [] }
            }
        },
        []
    )

    const persistExerciseVideoUrls = useCallback(
        async (updates: unknown) => {
            try {
                const rows = Array.isArray(updates) ? (updates as unknown[]) : []
                const filtered = rows
                    .map((r: unknown) => {
                        const row =
                            r && typeof r === 'object'
                                ? (r as Record<string, unknown>)
                                : ({} as Record<string, unknown>)
                        return {
                            id: String(row?.id || '').trim(),
                            url: String(row?.url || '').trim(),
                        }
                    })
                    .filter((r) => !!r.id && !!r.url)
                    .slice(0, 100)
                if (!filtered.length) return
                await Promise.allSettled(
                    filtered.map((r: { id: string; url: string }) =>
                        supabase.from('exercises').update({ video_url: r.url }).eq('id', r.id)
                    )
                )
            } catch { }
        },
        [supabase]
    )

    const generateExerciseKey = useCallback(() => {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
                return crypto.randomUUID()
        } catch { }
        return `ex_${Date.now()}_${Math.random().toString(16).slice(2)}`
    }, [])

    const normalizeWorkoutForEditor = useCallback(
        (raw: unknown) => {
            try {
                const base =
                    raw && typeof raw === 'object'
                        ? (raw as Record<string, unknown>)
                        : ({} as Record<string, unknown>)
                const title = String(base.title || base.name || 'Treino').trim() || 'Treino'
                const exercisesRaw = Array.isArray(base.exercises) ? (base.exercises as unknown[]) : []
                const exercisesInitial = exercisesRaw
                    .filter((ex: unknown): ex is Record<string, unknown> =>
                        Boolean(ex && typeof ex === 'object')
                    )
                    .map((ex: Record<string, unknown>) => {
                        const existing = ex?._itx_exKey ? String(ex._itx_exKey) : ''
                        const fromId = ex?.id != null ? `id_${String(ex.id)}` : ''
                        const nextKey = existing || fromId || generateExerciseKey()
                        return { ...ex, _itx_exKey: nextKey }
                    })

                const seen = new Set<string>()
                const exercises = exercisesInitial.map((ex: Record<string, unknown>) => {
                    const k = String(ex?._itx_exKey || '')
                    if (!k || seen.has(k)) {
                        const nextKey = generateExerciseKey()
                        seen.add(nextKey)
                        return { ...ex, _itx_exKey: nextKey }
                    }
                    seen.add(k)
                    return ex
                })

                return { ...base, title, exercises }
            } catch {
                return { title: 'Treino', exercises: [] as Exercise[] }
            }
        },
        [generateExerciseKey]
    )

    const stripWorkoutInternalKeys = useCallback((workout: unknown) => {
        try {
            const w =
                workout && typeof workout === 'object'
                    ? (workout as Record<string, unknown>)
                    : ({} as Record<string, unknown>)
            const exercises = Array.isArray(w.exercises)
                ? (w.exercises as unknown[]).map((ex: unknown) => {
                    if (!ex || typeof ex !== 'object') return ex
                    const obj = ex as Record<string, unknown>
                    const { _itx_exKey, ...rest } = obj
                    void _itx_exKey
                    return rest
                })
                : w.exercises
            return { ...w, exercises }
        } catch {
            return workout
        }
    }, [])

    const reindexSessionLogsAfterWorkoutEdit = useCallback(
        (oldWorkout: unknown, newWorkout: unknown, logs: unknown) => {
            try {
                const safeLogs =
                    logs && typeof logs === 'object' ? (logs as Record<string, unknown>) : {}
                const oldObj =
                    oldWorkout && typeof oldWorkout === 'object'
                        ? (oldWorkout as Record<string, unknown>)
                        : ({} as Record<string, unknown>)
                const newObj =
                    newWorkout && typeof newWorkout === 'object'
                        ? (newWorkout as Record<string, unknown>)
                        : ({} as Record<string, unknown>)
                const oldExercises = Array.isArray(oldObj?.exercises)
                    ? (oldObj.exercises as unknown[])
                    : []
                const newExercises = Array.isArray(newObj?.exercises)
                    ? (newObj.exercises as unknown[])
                    : []
                const oldKeyByIndex = oldExercises.map((ex: unknown) => {
                    const exObj =
                        ex && typeof ex === 'object'
                            ? (ex as Record<string, unknown>)
                            : ({} as Record<string, unknown>)
                    return String(exObj?._itx_exKey || '')
                })
                const newIndexByKey = new Map<string, number>()
                newExercises.forEach((ex: unknown, idx: number) => {
                    const exObj =
                        ex && typeof ex === 'object'
                            ? (ex as Record<string, unknown>)
                            : ({} as Record<string, unknown>)
                    const k = String(exObj?._itx_exKey || '')
                    if (!k) return
                    if (newIndexByKey.has(k)) return
                    newIndexByKey.set(k, idx)
                })

                const result: Record<string, unknown> = {}
                Object.entries(safeLogs).forEach(([k, v]) => {
                    const parts = String(k || '').split('-')
                    if (parts.length !== 2) { result[k] = v; return }
                    const oldIdx = Number(parts[0])
                    const setIdx = Number(parts[1])
                    if (!Number.isFinite(oldIdx) || !Number.isFinite(setIdx)) {
                        result[k] = v
                        return
                    }
                    const exKey = oldKeyByIndex[oldIdx] || ''
                    const newIdx = exKey ? newIndexByKey.get(exKey) : undefined
                    if (typeof newIdx !== 'number' || newIdx < 0) return
                    const ex = newExercises[newIdx] || null
                    const exObj =
                        ex && typeof ex === 'object'
                            ? (ex as Record<string, unknown>)
                            : ({} as Record<string, unknown>)
                    const headerSets = Number.parseInt(String(exObj?.sets ?? ''), 10) || 0
                    const details = Array.isArray(exObj?.setDetails)
                        ? (exObj.setDetails as unknown[])
                        : Array.isArray(exObj?.set_details)
                            ? (exObj.set_details as unknown[])
                            : []
                    const maxSets = headerSets || (Array.isArray(details) ? details.length : 0)
                    if (maxSets && setIdx >= maxSets) return
                    result[`${newIdx}-${setIdx}`] = v
                })

                return result
            } catch {
                return logs && typeof logs === 'object' ? logs : {}
            }
        },
        []
    )

    return {
        resolveExerciseVideos,
        persistExerciseVideoUrls,
        generateExerciseKey,
        normalizeWorkoutForEditor,
        stripWorkoutInternalKeys,
        reindexSessionLogsAfterWorkoutEdit,
    }
}
