'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { mapWorkoutRow, sortWorkoutsByOrder } from '@/utils/mapWorkoutRow'
import { cacheGetWorkouts, cacheSetWorkouts } from '@/lib/offline/offlineSync'
import { logError, logWarn } from '@/lib/logger'
import { safePg } from '@/utils/safePgFilter'
import type { Exercise } from '@/types/app'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

/**
 * useWorkoutFetch — PR-E do REACT19_MIGRATION_PLAN.
 *
 * Migração de useState+useEffect manual pra TanStack Query mantendo a API
 * pública 100% intacta (8 valores retornados). API consumer (IronTracksApp,
 * VipHub via custom event) NÃO precisa mudar.
 *
 * Camadas de cache preservadas:
 *   1. localStorage `it_workouts_cache_v1_<userId>` (sync, zero-flicker startup)
 *      → `initialData` do Query
 *   2. IndexedDB via cacheGetWorkouts (async, offline)
 *      → fallback dentro da queryFn quando offline OU fetch falha
 *   3. /api/workouts/list (legacy server route)
 *      → último fallback dentro da queryFn
 *
 * Branching role-based preservado:
 *   - admin/teacher: hidrata workouts próprios + lista alunos + workouts dos alunos
 *     → produz studentFolders (folder = aluno com seus workouts)
 *   - student/user: hidrata só seus workouts; studentFolders mostra "treinos
 *     compartilhados de <coach>" agrupados
 *
 * Custom event `irontracks:workouts-changed` (despachado por VipHub) agora
 * invalida a query (em vez de chamar fetchWorkouts manualmente) — TanStack
 * faz dedup + cancellation automática.
 */

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

interface WorkoutFetchResult {
    workouts: Array<Record<string, unknown>>
    stats: WorkoutStats
    studentFolders: Array<StudentFolder>
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
    isFetching: MutableRefObject<boolean>
}

const EMPTY_STATS: WorkoutStats = { workouts: 0, exercises: 0, activeStreak: 0 }

// ─────────────────────────────────────────────────────────────────────────────
// Hidratação de workouts: busca exercícios + sets em queries separadas
// (evita limite de payload do Postgrest)
// ─────────────────────────────────────────────────────────────────────────────

async function hydrateWorkouts(
    supabase: SupabaseClient,
    rows: unknown,
): Promise<Array<Record<string, unknown>>> {
    const base: Array<Record<string, unknown>> = Array.isArray(rows) ? rows.filter(isRecord) : []
    const workoutIds = base.map((w) => String(w.id ?? '')).filter(Boolean)
    if (workoutIds.length === 0) return base.map((w) => ({ ...w, exercises: [] as Exercise[] }))

    let exercises: Array<Record<string, unknown>> = []
    try {
        const { data: exRows } = await supabase
            .from('exercises')
            .select('id, workout_id, name, notes, video_url, rest_time, cadence, method, "order", is_unilateral, is_alternating, side_rest_time, transition_time')
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
                .select('id, exercise_id, set_number, reps, rpe, weight, is_warmup, advanced_config')
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

// ─────────────────────────────────────────────────────────────────────────────
// Branching role-based: fetch principal
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWorkoutsByRole(
    supabase: SupabaseClient,
    currentUser: { id: string; role?: string },
): Promise<{ workouts: Array<Record<string, unknown>>; studentData: Array<Record<string, unknown>>; studentsList: Array<Record<string, unknown>> }> {
    const role = String(currentUser?.role || 'user') || 'user'

    let data: Array<Record<string, unknown>> = []
    let studentData: Array<Record<string, unknown>> = []
    let studentsList: Array<Record<string, unknown>> = []

    if (role === 'admin' || role === 'teacher') {
        // 1. Busca alunos
        try {
            const { data: st } = await supabase
                .from('students')
                .select('id, name, email, user_id')
                .or(`teacher_id.eq.${safePg(currentUser.id)},user_id.eq.${safePg(currentUser.id)}`)
                .order('name')
            studentsList = Array.isArray(st) ? st : []
        } catch (e) {
            logError('error', 'Erro fetching students', e)
        }

        // 2. Busca meus treinos (template)
        const { data: myBase, error: myErr } = await supabase
            .from('workouts')
            .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
            .eq('is_template', true)
            .eq('user_id', currentUser.id)
            .order('name', { ascending: true })
        if (myErr) throw myErr
        data = await hydrateWorkouts(supabase, Array.isArray(myBase) ? myBase : [])

        if (!Array.isArray(data) || data.length === 0) {
            try {
                const { data: myAllBase } = await supabase
                    .from('workouts')
                    .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                    .limit(500)
                data = await hydrateWorkouts(supabase, Array.isArray(myAllBase) ? myAllBase : [])
            } catch (e) { logWarn('useWorkoutFetch', 'silenced error', e) }
        }

        // 3. Busca treinos dos alunos
        const ids = studentsList.map((s) => String(s.user_id ?? s.id ?? '')).filter(Boolean)
        if (ids.length > 0) {
            const seen = new Set<string>()
            const combined: Array<Record<string, unknown>> = []
            try {
                const { data: swByUserBase } = await supabase
                    .from('workouts')
                    .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
                    .eq('is_template', true)
                    .in('user_id', ids)
                    .order('name')
                    .limit(500)
                const swByUser = await hydrateWorkouts(supabase, swByUserBase || [])
                for (const w of swByUser) {
                    const id = String(w?.id ?? '')
                    if (!id || seen.has(id)) continue
                    seen.add(id); combined.push(w)
                }
            } catch (e) { logWarn('useWorkoutFetch', 'silenced error', e) }
            try {
                const { data: swByStudentBase } = await supabase
                    .from('workouts')
                    .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
                    .eq('is_template', true)
                    .in('student_id', ids)
                    .order('name')
                    .limit(500)
                const swByStudent = await hydrateWorkouts(supabase, swByStudentBase || [])
                for (const w of swByStudent) {
                    const id = String(w?.id ?? '')
                    if (!id || seen.has(id)) continue
                    seen.add(id); combined.push(w)
                }
            } catch (e) { logWarn('useWorkoutFetch', 'silenced error', e) }
            studentData = combined
        }
    } else {
        // Aluno/usuário normal
        const { data: baseRows, error } = await supabase
            .from('workouts')
            .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
            .eq('is_template', true)
            .eq('user_id', currentUser.id)
            .order('name', { ascending: true })
        if (error) throw error
        data = await hydrateWorkouts(supabase, baseRows || [])

        if (!data.length) {
            try {
                const { data: anyRows, error: anyErr } = await supabase
                    .from('workouts')
                    .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
                    .eq('user_id', currentUser.id)
                    .order('name', { ascending: true })
                    .limit(500)
                if (!anyErr && Array.isArray(anyRows) && anyRows.length) {
                    data = await hydrateWorkouts(supabase, anyRows)
                }
            } catch (e) { logWarn('useWorkoutFetch', 'silenced error', e) }
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
                        .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
                        .eq('is_template', true)
                        .or(`user_id.eq.${safePg(studentId)},student_id.eq.${safePg(studentId)}`)
                        .order('name', { ascending: true })
                        .limit(500)
                    const legacyHydrated = await hydrateWorkouts(supabase, legacyBase || [])
                    const seen = new Set<string>()
                    const merged: Array<Record<string, unknown>> = []
                    for (const w of legacyHydrated) {
                        const id = String(w?.id ?? '')
                        if (!id || seen.has(id)) continue
                        seen.add(id); merged.push(w)
                    }
                    data = merged
                }
            } catch (e) { logWarn('useWorkoutFetch', 'silenced error', e) }
        }

        if (!data.length) {
            try {
                const resLegacy = await fetch('/api/workouts/list', { cache: 'no-store' })
                const jsonLegacy = await resLegacy.json().catch((): unknown => null)
                const jsonLegacyObj = jsonLegacy && typeof jsonLegacy === 'object'
                    ? (jsonLegacy as Record<string, unknown>) : null
                const rows = Array.isArray(jsonLegacyObj?.rows) ? (jsonLegacyObj?.rows as unknown[]) : []
                if (jsonLegacyObj?.ok && rows.length) {
                    data = rows.map((w: unknown) => {
                        const row = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
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
            } catch (e) { logWarn('useWorkoutFetch', 'silenced error', e) }
        }
    }

    return { workouts: data, studentData, studentsList }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pós-processamento: mapWorkoutRow + ordenação + cache + studentFolders
// ─────────────────────────────────────────────────────────────────────────────

async function processAndCache(
    supabase: SupabaseClient,
    currentUser: { id: string; role?: string },
    raw: { workouts: Array<Record<string, unknown>>; studentData: Array<Record<string, unknown>>; studentsList: Array<Record<string, unknown>> },
): Promise<WorkoutFetchResult> {
    const role = String(currentUser?.role || 'user') || 'user'

    const mappedRaw = raw.workouts.map((row) => mapWorkoutRow(row)).filter(Boolean) as Array<Record<string, unknown>>
    const mapped = sortWorkoutsByOrder(mappedRaw)

    // Cache em IDB + localStorage pro próximo boot
    try { await cacheSetWorkouts({ userId: currentUser.id, workouts: mapped }) }
    catch (e) { logWarn('useWorkoutFetch', 'idb cache write failed', e) }
    try {
        if (typeof window !== 'undefined') {
            localStorage.setItem(`it_workouts_cache_v1_${currentUser.id}`, JSON.stringify(mapped))
        }
    } catch (e) { logWarn('useWorkoutFetch', 'localStorage cache write failed', e) }

    let studentFolders: StudentFolder[] = []
    if (role === 'admin' || role === 'teacher') {
        try {
            const studentMapped = (raw.studentData || []).map(mapWorkoutRow)
            const byStudent = new Map<string, Array<Record<string, unknown>>>()
            for (const w of studentMapped) {
                const sid = w.userId as string
                if (!sid) continue
                const list = byStudent.get(sid) || []
                list.push(w)
                byStudent.set(sid, list)
            }
            const nameById = new Map<string, { name: string; email: string }>()
            for (const s of raw.studentsList || []) {
                const sid = (s.user_id || s.id) as string
                if (!sid) continue
                nameById.set(sid, {
                    name: String(s.name || String(sid).slice(0, 8)),
                    email: String(s.email || ''),
                })
            }
            studentFolders = Array.from(byStudent.entries())
                .map(([sid, list]) => {
                    const info = nameById.get(sid) || { name: String(sid).slice(0, 8), email: '' }
                    return { id: sid, name: info.name, email: info.email, workouts: list }
                })
                .filter((f) => (f.workouts || []).length > 0)
        } catch (err) {
            logError('error', 'Erro ao processar alunos:', err)
            studentFolders = []
        }
    } else {
        try {
            const shared = mapped.filter(
                (w: Record<string, unknown>) =>
                    w.createdBy && String(w.createdBy) !== String(currentUser.id),
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
                    .from('profiles_public')
                    .select('id, display_name')
                    .in('id', coachIds)
                profiles = profs || []
            }
            const nameByCoach = new Map(
                profiles.map((p) => [p.id, p.display_name || String(p.id).slice(0, 8)]),
            )
            studentFolders = Array.from(byCoach.entries()).map(([cid, list]) => ({
                id: cid,
                name: `Treinos compartilhados de ${nameByCoach.get(cid) || String(cid).slice(0, 8)}`,
                email: '',
                workouts: list,
            }))
        } catch {
            studentFolders = []
        }
    }

    const totalEx = mapped.reduce(
        (acc: number, w: Record<string, unknown>) =>
            acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
        0,
    )

    return {
        workouts: mapped,
        stats: { workouts: mapped.length, exercises: totalEx, activeStreak: 0 },
        studentFolders,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline fallback (IDB)
// ─────────────────────────────────────────────────────────────────────────────

async function readOfflineCache(): Promise<WorkoutFetchResult | null> {
    try {
        const cached = await cacheGetWorkouts()
        const cachedObj = cached && typeof cached === 'object' ? (cached as Record<string, unknown>) : null
        const cachedWorkouts = Array.isArray(cachedObj?.workouts)
            ? (cachedObj?.workouts as Array<Record<string, unknown>>)
            : []
        if (!cachedWorkouts.length) return null
        const totalEx = cachedWorkouts.reduce(
            (acc: number, w: Record<string, unknown>) =>
                acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
            0,
        )
        return {
            workouts: cachedWorkouts,
            stats: { workouts: cachedWorkouts.length, exercises: totalEx, activeStreak: 0 },
            studentFolders: [],
        }
    } catch (e) {
        logWarn('useWorkoutFetch', 'idb cache read failed', e)
        return null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial data: localStorage sync read pra zero-flicker startup
// ─────────────────────────────────────────────────────────────────────────────

function readLocalStorageCache(userId: string): WorkoutFetchResult | null {
    if (typeof window === 'undefined' || !userId) return null
    try {
        const raw = localStorage.getItem(`it_workouts_cache_v1_${userId}`)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) return null
        // Hot path — não validamos schema completo (Zod custaria CPU no boot).
        // Treat as Record<string, unknown>[] e confiamos no mapWorkoutRow upstream.
        const workouts = parsed as Array<Record<string, unknown>>
        const totalEx = workouts.reduce(
            (acc: number, w: Record<string, unknown>) =>
                acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
            0,
        )
        return {
            workouts,
            stats: { workouts: workouts.length, exercises: totalEx, activeStreak: 0 },
            studentFolders: [],
        }
    } catch (e) {
        logWarn('useWorkoutFetch', 'localStorage initial read failed', e)
        return null
    }
}

function readLegacyLocalStorage(userId: string): Array<Record<string, unknown>> | null {
    if (typeof window === 'undefined' || !userId) return null
    try {
        const cached = localStorage.getItem(`workouts_cache_${userId}`)
        if (!cached) return null
        const arr = parseJsonWithSchema(cached, z.array(z.record(z.unknown())))
        return Array.isArray(arr) && arr.length > 0 ? arr : null
    } catch (e) {
        logWarn('useWorkoutFetch', 'legacy localStorage restore failed', e)
        return null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useWorkoutFetch({
    user,
    supabase,
    initialWorkouts,
}: UseWorkoutFetchOptions): UseWorkoutFetchReturn {
    const queryClient = useQueryClient()
    const userId = user?.id ?? ''
    const role = user?.role ?? 'user'
    const queryKey = useMemo(() => ['workouts', userId, role] as const, [userId, role])

    // Initial data resolver — chamado pelo Query no primeiro mount.
    // Ordem: (1) initialWorkouts via SSR, (2) localStorage cache, (3) legacy localStorage.
    const initial = useMemo<WorkoutFetchResult | undefined>(() => {
        if (!userId) return undefined
        if (Array.isArray(initialWorkouts) && initialWorkouts.length > 0) {
            const mapped = sortWorkoutsByOrder(initialWorkouts.map((w) => mapWorkoutRow(w)).filter(Boolean) as Array<Record<string, unknown>>)
            const totalEx = mapped.reduce(
                (acc: number, w: Record<string, unknown>) =>
                    acc + (Array.isArray(w?.exercises) ? (w.exercises as unknown[]).length : 0),
                0,
            )
            return {
                workouts: mapped,
                stats: { workouts: mapped.length, exercises: totalEx, activeStreak: 0 },
                studentFolders: [],
            }
        }
        const ls = readLocalStorageCache(userId)
        if (ls) return ls
        const legacy = readLegacyLocalStorage(userId)
        if (legacy) {
            return {
                workouts: legacy,
                stats: EMPTY_STATS,
                studentFolders: [],
            }
        }
        return undefined
    }, [initialWorkouts, userId])

    const query = useQuery<WorkoutFetchResult>({
        queryKey,
        enabled: !!userId,
        initialData: initial,
        initialDataUpdatedAt: 0, // força refetch após mount pra pegar dado fresco
        queryFn: async (): Promise<WorkoutFetchResult> => {
            if (!userId) return { workouts: [], stats: EMPTY_STATS, studentFolders: [] }

            // Offline: usa cache IDB
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                const offline = await readOfflineCache()
                if (offline) return offline
                return { workouts: [], stats: EMPTY_STATS, studentFolders: [] }
            }

            try {
                const raw = await fetchWorkoutsByRole(supabase, { id: userId, role })
                if (!Array.isArray(raw.workouts)) {
                    logWarn('warn', 'Fetch sem dados; mantendo estado atual')
                    // Retorna estado atual via cache (Query mantém data anterior se throw)
                    throw new Error('no_data')
                }
                return await processAndCache(supabase, { id: userId, role }, raw)
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                if (msg.includes('Failed to fetch') || msg.includes('ERR_ABORTED')) {
                    // Network errors: tenta cache offline
                    const offline = await readOfflineCache()
                    if (offline) return offline
                }
                logError('Erro ao buscar:', { message: msg, error: e })
                throw e
            }
        },
        // Workouts mudam quando usuário cria/edita/deleta — invalidação é manual
        // (via custom event ou setQueryData otimista). 60s de staleTime evita
        // refetch instantâneo após hydration mas mantém dado fresco em re-foco.
        staleTime: 60_000,
    })

    // ─── API legada: setters via queryClient.setQueryData ──────────────────
    const setWorkouts: React.Dispatch<React.SetStateAction<Array<Record<string, unknown>>>> = useCallback(
        (updater) => {
            queryClient.setQueryData<WorkoutFetchResult>(queryKey, (prev) => {
                const baseWorkouts = prev?.workouts ?? []
                const nextWorkouts = typeof updater === 'function'
                    ? (updater as (p: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)(baseWorkouts)
                    : updater
                return {
                    workouts: nextWorkouts,
                    stats: prev?.stats ?? EMPTY_STATS,
                    studentFolders: prev?.studentFolders ?? [],
                }
            })
        },
        [queryClient, queryKey],
    )

    const setStats: React.Dispatch<React.SetStateAction<WorkoutStats>> = useCallback(
        (updater) => {
            queryClient.setQueryData<WorkoutFetchResult>(queryKey, (prev) => {
                const baseStats = prev?.stats ?? EMPTY_STATS
                const nextStats = typeof updater === 'function'
                    ? (updater as (p: WorkoutStats) => WorkoutStats)(baseStats)
                    : updater
                return {
                    workouts: prev?.workouts ?? [],
                    stats: nextStats,
                    studentFolders: prev?.studentFolders ?? [],
                }
            })
        },
        [queryClient, queryKey],
    )

    const setStudentFolders: React.Dispatch<React.SetStateAction<Array<StudentFolder>>> = useCallback(
        (updater) => {
            queryClient.setQueryData<WorkoutFetchResult>(queryKey, (prev) => {
                const baseFolders = prev?.studentFolders ?? []
                const nextFolders = typeof updater === 'function'
                    ? (updater as (p: Array<StudentFolder>) => Array<StudentFolder>)(baseFolders)
                    : updater
                return {
                    workouts: prev?.workouts ?? [],
                    stats: prev?.stats ?? EMPTY_STATS,
                    studentFolders: nextFolders,
                }
            })
        },
        [queryClient, queryKey],
    )

    // fetchWorkouts: dispara refetch via Query (compat com signature antiga).
    const fetchWorkouts = useCallback(
        async (specificUser?: { id: string; role?: string } | null): Promise<void> => {
            // Quando chamado com user diferente, invalida queries dele em vez do atual.
            if (specificUser && specificUser.id && specificUser.id !== userId) {
                await queryClient.invalidateQueries({
                    queryKey: ['workouts', specificUser.id, specificUser.role ?? 'user'],
                })
                return
            }
            await query.refetch()
        },
        [query, queryClient, userId],
    )

    // isFetching ref sincronizada com query.isFetching pra compat com consumers.
    const isFetching = useRef(false)
    useEffect(() => {
        isFetching.current = query.isFetching
    }, [query.isFetching])

    // Custom event listener — VipHub e outros despacham
    // 'irontracks:workouts-changed' depois de criar/editar via API externa.
    useEffect(() => {
        const handler = () => {
            if (!userId) return
            void queryClient.invalidateQueries({ queryKey: ['workouts', userId, role] })
        }
        window.addEventListener('irontracks:workouts-changed', handler)
        return () => window.removeEventListener('irontracks:workouts-changed', handler)
    }, [queryClient, userId, role])

    return {
        workouts: query.data?.workouts ?? [],
        setWorkouts,
        stats: query.data?.stats ?? EMPTY_STATS,
        setStats,
        studentFolders: query.data?.studentFolders ?? [],
        setStudentFolders,
        fetchWorkouts,
        isFetching,
    }
}
