'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapWorkoutRow } from '@/utils/mapWorkoutRow'
import { cacheGetWorkouts, cacheSetWorkouts } from '@/lib/offline/offlineSync'
import { logError, logWarn } from '@/lib/logger'
import type { Exercise } from '@/types/app'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

interface WorkoutStats {
    workouts: number
    exercises: number
    activeStreak: number
}

interface StudentFolder {
    id: string
    name: string
    email: string
    workouts: Array<Record<string, unknown>>
}

interface UseWorkoutFetchOptions {
    user: { id: string; role?: string } | null
    supabase: SupabaseClient
    initialWorkouts?: Array<Record<string, unknown>>
}

interface UseWorkoutFetchReturn {
    workouts: Array<Record<string, unknown>>
    setWorkouts: React.Dispatch<React.SetStateAction<Array<Record<string, unknown>>>>
    stats: WorkoutStats
    setStats: React.Dispatch<React.SetStateAction<WorkoutStats>>
    studentFolders: Array<StudentFolder>
    setStudentFolders: React.Dispatch<React.SetStateAction<Array<StudentFolder>>>
    fetchWorkouts: (specificUser?: { id: string; role?: string } | null) => Promise<void>
    isFetching: React.MutableRefObject<boolean>
}

export function useWorkoutFetch({
    user,
    supabase,
    initialWorkouts,
}: UseWorkoutFetchOptions): UseWorkoutFetchReturn {
    const [workouts, setWorkouts] = useState<Array<Record<string, unknown>>>(() => {
        if (Array.isArray(initialWorkouts) && initialWorkouts.length > 0) {
            return initialWorkouts.map((w) => mapWorkoutRow(w))
        }
        return []
    })
    const [stats, setStats] = useState<WorkoutStats>({ workouts: 0, exercises: 0, activeStreak: 0 })
    const [studentFolders, setStudentFolders] = useState<Array<StudentFolder>>([])
    const isFetching = useRef(false)

    const fetchWorkouts = useCallback(async (specificUser = user) => {
        if (isFetching.current) return
        isFetching.current = true

        try {
            const currentUser = specificUser

            if (!currentUser?.id) {
                logWarn('warn', 'DASHBOARD: Usuário não identificado ao buscar treinos.')
                return
            }

            // Offline: usa cache
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                try {
                    const cached = await cacheGetWorkouts()
                    const cachedObj = cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : null
                    const cachedWorkouts = Array.isArray(cachedObj?.workouts)
                        ? (cachedObj?.workouts as Array<Record<string, unknown>>)
                        : []
                    if (cachedWorkouts.length) {
                        setWorkouts(cachedWorkouts)
                        const totalEx = cachedWorkouts.reduce(
                            (acc: number, w: Record<string, unknown>) =>
                                acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
                            0
                        )
                        setStats({ workouts: cachedWorkouts.length, exercises: totalEx, activeStreak: 0 })
                    }
                } catch { }
                return
            }

            const role = String(currentUser?.role || 'user') || 'user'

            let data: Array<Record<string, unknown>> = []
            let studentData: Array<Record<string, unknown>> = []
            let studentsList: Array<Record<string, unknown>> = []

            // Hidrata workouts com exercises + sets via queries separadas (evita limite de payload)
            const hydrateWorkouts = async (rows: unknown) => {
                const base: Array<Record<string, unknown>> = Array.isArray(rows)
                    ? rows.filter(isRecord)
                    : []
                const workoutIds = base.map((w) => String(w.id ?? '')).filter(Boolean)
                if (workoutIds.length === 0)
                    return base.map((w) => ({ ...w, exercises: [] as Exercise[] }))

                let exercises: Array<Record<string, unknown>> = []
                try {
                    const { data: exRows } = await supabase
                        .from('exercises')
                        .select('*')
                        .in('workout_id', workoutIds)
                        .order('order', { ascending: true })
                        .limit(5000)
                    exercises = Array.isArray(exRows) ? exRows.filter(isRecord) : []
                } catch {
                    exercises = []
                }

                const exIds = exercises.map((e) => String(e.id ?? '')).filter(Boolean)
                let sets: Array<Record<string, unknown>> = []
                if (exIds.length > 0) {
                    try {
                        const { data: setRows } = await supabase
                            .from('sets')
                            .select('*')
                            .in('exercise_id', exIds)
                            .order('set_number', { ascending: true })
                            .limit(20000)
                        sets = Array.isArray(setRows) ? setRows.filter(isRecord) : []
                    } catch {
                        sets = []
                    }
                }

                const setsByExercise = new Map<string, Array<Record<string, unknown>>>()
                for (const s of sets) {
                    const eid = String(s?.exercise_id ?? '')
                    if (!eid) continue
                    const list = setsByExercise.get(eid) || []
                    list.push(s)
                    setsByExercise.set(eid, list)
                }

                const exByWorkout = new Map<string, Array<Record<string, unknown>>>()
                for (const ex of exercises) {
                    const wid = String(ex?.workout_id ?? '')
                    if (!wid) continue
                    const exId = String(ex.id ?? '')
                    const exWithSets = { ...ex, sets: exId ? (setsByExercise.get(exId) || []) : [] }
                    const list = exByWorkout.get(wid) || []
                    list.push(exWithSets)
                    exByWorkout.set(wid, list)
                }

                return base.map((w) => ({
                    ...w,
                    exercises: exByWorkout.get(String(w.id ?? '')) || [],
                }))
            }

            if (role === 'admin' || role === 'teacher') {
                // 1. Busca alunos
                try {
                    const { data: st } = await supabase
                        .from('students')
                        .select('id, name, email, user_id')
                        .or(`teacher_id.eq.${currentUser.id},user_id.eq.${currentUser.id}`)
                        .order('name')
                    studentsList = Array.isArray(st) ? st : []
                } catch (e) {
                    logError('error', 'Erro fetching students', e)
                }

                // 2. Busca meus treinos (template)
                const { data: myBase, error: myErr } = await supabase
                    .from('workouts')
                    .select('*')
                    .eq('is_template', true)
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                if (myErr) throw myErr
                data = await hydrateWorkouts(Array.isArray(myBase) ? myBase : [])

                if (!Array.isArray(data) || data.length === 0) {
                    try {
                        const { data: myAllBase } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('user_id', currentUser.id)
                            .order('name', { ascending: true })
                            .limit(500)
                        data = await hydrateWorkouts(Array.isArray(myAllBase) ? myAllBase : [])
                    } catch { }
                }

                // 3. Busca treinos dos alunos
                const ids = studentsList
                    .map((s) => String(s.user_id ?? s.id ?? ''))
                    .filter(Boolean)
                if (ids.length > 0) {
                    const seen = new Set<string>()
                    const combined: Array<Record<string, unknown>> = []
                    try {
                        const { data: swByUserBase } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('is_template', true)
                            .in('user_id', ids)
                            .order('name')
                            .limit(500)
                        const swByUser = await hydrateWorkouts(swByUserBase || [])
                        for (const w of swByUser || []) {
                            const id = String((w as Record<string, unknown>)?.id ?? '')
                            if (!id) continue
                            if (!seen.has(id)) { seen.add(id); combined.push(w) }
                        }
                    } catch { }
                    try {
                        const { data: swByStudentBase } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('is_template', true)
                            .in('student_id', ids)
                            .order('name')
                            .limit(500)
                        const swByStudent = await hydrateWorkouts(swByStudentBase || [])
                        for (const w of swByStudent || []) {
                            const id = String((w as Record<string, unknown>)?.id ?? '')
                            if (!id) continue
                            if (!seen.has(id)) { seen.add(id); combined.push(w) }
                        }
                    } catch { }
                    studentData = combined
                }
            } else {
                // Aluno/usuário normal
                const { data: baseRows, error } = await supabase
                    .from('workouts')
                    .select('*')
                    .eq('is_template', true)
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                if (error) throw error
                data = await hydrateWorkouts(baseRows || [])

                if (!data.length) {
                    try {
                        const { data: anyRows, error: anyErr } = await supabase
                            .from('workouts')
                            .select('*')
                            .eq('user_id', currentUser.id)
                            .order('name', { ascending: true })
                            .limit(500)
                        if (!anyErr && Array.isArray(anyRows) && anyRows.length) {
                            data = await hydrateWorkouts(anyRows)
                        }
                    } catch { }
                }

                if (!data.length) {
                    try {
                        const { data: studentRow } = await supabase
                            .from('students')
                            .select('id')
                            .eq('user_id', currentUser.id)
                            .maybeSingle()
                        const studentId = studentRow?.id ? String(studentRow.id) : ''
                        if (studentId) {
                            const { data: legacyBase } = await supabase
                                .from('workouts')
                                .select('*')
                                .eq('is_template', true)
                                .or(`user_id.eq.${studentId},student_id.eq.${studentId}`)
                                .order('name', { ascending: true })
                                .limit(500)
                            const legacyHydrated = await hydrateWorkouts(legacyBase || [])
                            const seen = new Set<string>()
                            const merged: Array<Record<string, unknown>> = []
                            for (const w of legacyHydrated) {
                                const id = String((w as Record<string, unknown>)?.id ?? '')
                                if (!id) continue
                                if (seen.has(id)) continue
                                seen.add(id)
                                merged.push(w)
                            }
                            data = merged
                        }
                    } catch { }
                }

                if (!data.length) {
                    try {
                        const resLegacy = await fetch('/api/workouts/list', { cache: 'no-store' })
                        const jsonLegacy = await resLegacy.json().catch((): unknown => null)
                        const jsonLegacyObj =
                            jsonLegacy && typeof jsonLegacy === 'object'
                                ? (jsonLegacy as Record<string, unknown>)
                                : null
                        const rows = Array.isArray(jsonLegacyObj?.rows)
                            ? (jsonLegacyObj?.rows as unknown[])
                            : []
                        if (jsonLegacyObj?.ok && rows.length) {
                            data = rows.map((w: unknown) => {
                                const row =
                                    w && typeof w === 'object'
                                        ? (w as Record<string, unknown>)
                                        : ({} as Record<string, unknown>)
                                return {
                                    id: row?.id,
                                    name: row?.name,
                                    notes: null,
                                    is_template: true,
                                    user_id: currentUser.id,
                                    created_by: null,
                                    exercises: [] as Exercise[] as unknown[],
                                } as Record<string, unknown>
                            })
                        }
                    } catch { }
                }
            }

            if (Array.isArray(data)) {
                const mappedRaw = data.map((row) => mapWorkoutRow(row)).filter(Boolean)
                const mapped = mappedRaw.sort(
                    (a: Record<string, unknown>, b: Record<string, unknown>) => {
                        const ao = Number.isFinite(Number(a?.sortOrder)) ? Number(a.sortOrder) : 0
                        const bo = Number.isFinite(Number(b?.sortOrder)) ? Number(b.sortOrder) : 0
                        if (ao !== bo) return ao - bo
                        return String(a.title || '').localeCompare(String(b.title || ''))
                    }
                )

                try {
                    await cacheSetWorkouts({ userId: currentUser?.id, workouts: mapped })
                } catch { }

                if (role === 'admin' || role === 'teacher') {
                    setWorkouts(mapped)
                    try {
                        const studentMapped = (studentData || []).map(mapWorkoutRow)
                        const byStudent = new Map<string, Array<Record<string, unknown>>>()
                        for (const w of studentMapped) {
                            const sid = w.userId as string
                            if (!sid) continue
                            const list = byStudent.get(sid) || []
                            list.push(w)
                            byStudent.set(sid, list)
                        }
                        const nameById = new Map<string, { name: string; email: string }>()
                        for (const s of studentsList || []) {
                            const sid = (s.user_id || s.id) as string
                            if (!sid) continue
                            nameById.set(sid, {
                                name: String(s.name || String(sid).slice(0, 8)),
                                email: String(s.email || ''),
                            })
                        }
                        const folders: StudentFolder[] = Array.from(byStudent.entries())
                            .map(([sid, list]) => {
                                const info = nameById.get(sid) || {
                                    name: String(sid).slice(0, 8),
                                    email: '',
                                }
                                return { id: sid, name: info.name, email: info.email, workouts: list }
                            })
                            .filter((f) => (f.workouts || []).length > 0)
                        setStudentFolders(folders)
                    } catch (err) {
                        logError('error', 'Erro ao processar alunos:', err)
                        setStudentFolders([])
                    }
                } else {
                    setWorkouts(mapped)
                    try {
                        const shared = mapped.filter(
                            (w: Record<string, unknown>) =>
                                w.createdBy && String(w.createdBy) !== String(currentUser.id)
                        )
                        const byCoach = new Map<string, Array<Record<string, unknown>>>()
                        for (const w of shared) {
                            const cid = String(w.createdBy || '').trim()
                            if (!cid) continue
                            const list = byCoach.get(cid) || []
                            list.push(w)
                            byCoach.set(cid, list)
                        }
                        const coachIds = Array.from(byCoach.keys())
                        let profiles: Array<{ id: string; display_name?: string | null }> = []
                        if (coachIds.length) {
                            const { data: profs } = await supabase
                                .from('profiles')
                                .select('id, display_name')
                                .in('id', coachIds)
                            profiles = profs || []
                        }
                        const nameByCoach = new Map(
                            profiles.map((p) => [p.id, p.display_name || String(p.id).slice(0, 8)])
                        )
                        const folders: StudentFolder[] = Array.from(byCoach.entries()).map(
                            ([cid, list]) => ({
                                id: cid,
                                name: `Treinos compartilhados de ${nameByCoach.get(cid) || String(cid).slice(0, 8)}`,
                                email: '',
                                workouts: list,
                            })
                        )
                        setStudentFolders(folders)
                    } catch {
                        setStudentFolders([])
                    }
                }

                const totalEx = mapped.reduce(
                    (acc: number, w: Record<string, unknown>) =>
                        acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
                    0
                )
                setStats({ workouts: mapped.length, exercises: totalEx, activeStreak: 0 })
            } else {
                logWarn('warn', 'Fetch sem dados; mantendo estado atual')
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (msg.includes('Failed to fetch') || msg.includes('ERR_ABORTED')) {
                try {
                    const cached = await cacheGetWorkouts()
                    const cachedObj =
                        cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : null
                    const cachedWorkouts = Array.isArray(cachedObj?.workouts)
                        ? (cachedObj?.workouts as Array<Record<string, unknown>>)
                        : []
                    if (cachedWorkouts.length) {
                        setWorkouts(cachedWorkouts)
                        const totalEx = cachedWorkouts.reduce(
                            (acc: number, w: Record<string, unknown>) =>
                                acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
                            0
                        )
                        setStats({ workouts: cachedWorkouts.length, exercises: totalEx, activeStreak: 0 })
                    }
                } catch { }
                return
            }
            logError('Erro ao buscar:', { message: msg, error: e })
        } finally {
            isFetching.current = false
        }
    }, [supabase, user])

    // Dispara fetch ao montar / trocar usuário
    useEffect(() => {
        if (user) fetchWorkouts(user)
    }, [user, fetchWorkouts])

    // Restaura cache local se workouts ainda vazio
    useEffect(() => {
        if (user && workouts.length === 0) {
            try {
                const k = 'workouts_cache_' + user.id
                const cached = localStorage.getItem(k)
                if (cached) {
                    const arr = parseJsonWithSchema(cached, z.array(z.record(z.unknown())))
                    if (Array.isArray(arr) && arr.length > 0) setWorkouts(arr)
                }
            } catch { }
        }
    }, [user, workouts.length])

    return {
        workouts,
        setWorkouts,
        stats,
        setStats,
        studentFolders,
        setStudentFolders,
        fetchWorkouts,
        isFetching,
    }
}
