'use client'

import { useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    createWorkout,
    updateWorkout,
    deleteWorkout,
    setWorkoutArchived,
    setWorkoutSortOrder,
} from '@/actions/workout-actions'
import type { ActiveSession, ActiveWorkoutSession } from '@/types/app'
import { logWarn } from '@/lib/logger'
import {
    playStartSound,
} from '@/lib/sounds'
import {
    estimateExerciseSeconds,
    toMinutesRounded,
    calculateExerciseDuration,
} from '@/utils/pacing'
import { mapWorkoutRow } from '@/utils/mapWorkoutRow'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

interface UseWorkoutCrudOptions {
    user: { id: string; email?: string | null } | null
    workouts: Array<Record<string, unknown>>
    currentWorkout: ActiveSession | null
    activeSession: ActiveWorkoutSession | null
    userSettings: Record<string, unknown> | null
    setCurrentWorkout: (w: ActiveSession | null) => void
    setActiveSession: (updater: ((prev: ActiveWorkoutSession | null) => ActiveWorkoutSession | null) | ActiveWorkoutSession | null) => void
    setView: (v: string) => void
    setCreateWizardOpen: (open: boolean) => void
    setReportData: (data: unknown) => void
    setReportBackView: (v: string) => void
    suppressForeignFinishToastUntilRef: React.MutableRefObject<number>
    fetchWorkouts: () => Promise<void>
    alert: (msg: string, title?: string) => Promise<unknown>
    confirm: (msg: string, title?: string) => Promise<boolean>
    requestPreWorkoutCheckin: (workout: unknown) => Promise<unknown>
    resolveExerciseVideos: (exercises: unknown) => Promise<{ exercises: Array<Record<string, unknown>>; updates: Array<Record<string, unknown>> }>
    persistExerciseVideoUrls: (updates: unknown) => void
    normalizeWorkoutForEditor: (raw: unknown) => Record<string, unknown>
    stripWorkoutInternalKeys: (workout: unknown) => unknown
    reindexSessionLogsAfterWorkoutEdit: (oldWorkout: unknown, newWorkout: unknown, logs: unknown) => unknown
    editActiveBaseRef: React.MutableRefObject<Record<string, unknown> | null>
    editActiveAddExerciseRef: React.MutableRefObject<boolean>
    setEditActiveDraft: (draft: Record<string, unknown> | null) => void
    setEditActiveOpen: (open: boolean) => void
    inAppNotify: (payload: unknown) => void
}

interface UseWorkoutCrudReturn {
    handleStartSession: (workout: unknown) => Promise<void>
    handleFinishSession: (sessionData: unknown, showReport?: boolean) => Promise<void>
    handleCreateWorkout: () => void
    handleEditWorkout: (workout: unknown) => Promise<void>
    handleSaveWorkout: (workoutToSave?: unknown) => Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }>
    handlePersistWorkoutTemplateFromSession: (workoutFromSession: unknown) => Promise<{ ok: boolean; mode?: string; id?: string; error?: string }>
    handleOpenActiveWorkoutEditor: (options?: Record<string, unknown>) => void
    handleCloseActiveWorkoutEditor: () => void
    handleSaveActiveWorkoutEditor: (workoutFromEditor: unknown) => Promise<unknown>
    handleDeleteWorkout: (id: string, title: unknown) => Promise<void>
    handleRestoreWorkout: (workout: unknown) => Promise<void>
    handleBulkEditWorkouts: (items: unknown) => Promise<void>
}

export function useWorkoutCrud({
    user,
    workouts,
    currentWorkout,
    activeSession,
    userSettings,
    setCurrentWorkout,
    setActiveSession,
    setView,
    setCreateWizardOpen,
    setReportData,
    setReportBackView,
    suppressForeignFinishToastUntilRef,
    fetchWorkouts,
    alert,
    confirm,
    requestPreWorkoutCheckin,
    resolveExerciseVideos,
    persistExerciseVideoUrls,
    normalizeWorkoutForEditor,
    stripWorkoutInternalKeys,
    reindexSessionLogsAfterWorkoutEdit,
    editActiveBaseRef,
    editActiveAddExerciseRef,
    setEditActiveDraft,
    setEditActiveOpen,
    inAppNotify,
}: UseWorkoutCrudOptions): UseWorkoutCrudReturn {

    const handleStartSession = useCallback(async (workout: unknown) => {
        const workoutObj = workout && typeof workout === 'object'
            ? (workout as Record<string, unknown>)
            : ({} as Record<string, unknown>)
        const exercisesList = Array.isArray(workoutObj?.exercises)
            ? (workoutObj.exercises as unknown[]).filter(
                (ex: unknown): ex is Record<string, unknown> => Boolean(ex && typeof ex === 'object')
            )
            : []

        if (exercisesList.length === 0) {
            await alert('Este treino está sem exercícios válidos. Edite o treino antes de iniciar.', 'Treino incompleto')
            return
        }

        const first = exercisesList[0] || {}
        const exMin = toMinutesRounded(estimateExerciseSeconds(first))
        const totalMin = toMinutesRounded(
            exercisesList.reduce(
                (acc: number, ex: Record<string, unknown>) => acc + calculateExerciseDuration(ex),
                0
            )
        )
        const workoutTitle = String(workoutObj?.title || workoutObj?.name || 'Treino')
        const ok = await confirm(
            `Iniciar "${workoutTitle}"? Primeiro exercício: ~${exMin} min. Estimado total: ~${totalMin} min.`,
            'Iniciar Treino'
        )
        if (!ok) return

        // Pre-workout check-in
        let preCheckin = null
        try {
            const s = userSettings
            const prompt = s ? s.promptPreWorkoutCheckin !== false : true
            if (prompt) {
                preCheckin = await requestPreWorkoutCheckin(workout)
                if (preCheckin && user?.id) {
                    const pre = preCheckin && typeof preCheckin === 'object'
                        ? (preCheckin as Record<string, unknown>)
                        : ({} as Record<string, unknown>)
                    const energyN = Number(pre.energy)
                    const sorenessN = Number(pre.soreness)
                    const timeN = Number(pre.timeMinutes)
                    const supabase = createClient()
                    const { error: checkinError } = await supabase.from('workout_checkins').insert({
                        user_id: user.id,
                        kind: 'pre',
                        planned_workout_id: String(workoutObj?.id || '').trim() ? workoutObj.id : null,
                        active_session_user_id: null,
                        energy: Number.isFinite(energyN) && energyN >= 1 && energyN <= 5 ? Math.round(energyN) : null,
                        soreness: Number.isFinite(sorenessN) && sorenessN >= 0 && sorenessN <= 10 ? Math.round(sorenessN) : null,
                        notes: String(pre.notes || '').trim() ? String(pre.notes || '').trim() : null,
                        answers: {
                            time_minutes: Number.isFinite(timeN) && timeN > 0 ? Math.round(timeN) : null,
                        },
                    })
                    if (checkinError) throw checkinError
                }
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e || '')
            logWarn('warn', 'Falha ao salvar check-in pré-treino:', message)
        }

        // Resolve exercise videos
        let resolvedExercises = exercisesList
        try {
            const resolved = await resolveExerciseVideos(exercisesList)
            resolvedExercises = Array.isArray(resolved?.exercises) ? resolved.exercises : exercisesList
            persistExerciseVideoUrls(resolved?.updates || [])
        } catch { }

        // Play start sound
        {
            const s = userSettings
            const enabled = s ? s.enableSounds !== false : true
            const volumeRaw = Number(s?.soundVolume ?? 100)
            const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw / 100)) : 1
            playStartSound({ enabled, volume })
        }

        const sessionWorkout = { ...workoutObj, exercises: resolvedExercises } as unknown as ActiveSession
        setActiveSession({
            workout: sessionWorkout,
            logs: {} as Record<string, unknown>,
            ui: {
                baseExerciseCount: resolvedExercises.length,
                pendingTemplateUpdate: false,
                preCheckin: preCheckin && typeof preCheckin === 'object'
                    ? (preCheckin as Record<string, unknown>)
                    : null,
            },
            startedAt: Date.now(),
            timerTargetTime: null,
            timerContext: null,
        } as unknown as ActiveWorkoutSession)
        setView('active')

        // Social workout-start ping
        try {
            const wid = String(workoutObj?.id || '').trim() || null
            const title = String(workoutObj?.title || workoutObj?.name || 'Treino').trim()
            fetch('/api/social/workout-start', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ workout_id: wid, workout_title: title }),
            }).catch(() => { })
        } catch { }

        // Request notification permission
        {
            const s = userSettings
            const allowPrompt = s ? s.notificationPermissionPrompt !== false : true
            if (
                allowPrompt &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'default'
            ) {
                Notification.requestPermission().catch((e: unknown) =>
                    logWarn('Erro permissão notificação:', String((e as Error)?.message ?? e))
                )
            }
        }
    }, [
        alert,
        confirm,
        persistExerciseVideoUrls,
        requestPreWorkoutCheckin,
        resolveExerciseVideos,
        setActiveSession,
        setView,
        user?.id,
        userSettings,
    ])

    const handleFinishSession = useCallback(async (sessionData: unknown, showReport?: boolean) => {
        suppressForeignFinishToastUntilRef.current = Date.now() + 8000
        try {
            if (user?.id) {
                localStorage.removeItem(`irontracks.activeSession.v2.${user.id}`)
            }
            localStorage.removeItem('activeSession')
        } catch { }
        setActiveSession(null)
        if (showReport === false) {
            setView('dashboard')
            return
        }
        setReportBackView('dashboard')
        setReportData({ current: sessionData, previous: null })
        setView('report')
    }, [setActiveSession, setReportBackView, setReportData, setView, suppressForeignFinishToastUntilRef, user?.id])

    const handleCreateWorkout = useCallback(() => {
        setCreateWizardOpen(true)
    }, [setCreateWizardOpen])

    const handleEditWorkout = useCallback(async (workout: unknown) => {
        const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : null
        if (!w || !w.id) return
        try {
            const supabase = createClient()
            const { data, error } = await supabase
                .from('workouts')
                .select('*, exercises(*, sets(*))')
                .eq('id', w.id)
                .maybeSingle()
            if (error) throw error
            if (!data) {
                setCurrentWorkout(w as unknown as ActiveSession)
                setView('edit')
                return
            }
            const mapped = mapWorkoutRow(data)
            try {
                const mappedObj = mapped && typeof mapped === 'object'
                    ? (mapped as Record<string, unknown>)
                    : ({} as Record<string, unknown>)
                const resolved = await resolveExerciseVideos(mappedObj?.exercises || [])
                const exercises = Array.isArray(resolved?.exercises)
                    ? resolved.exercises
                    : Array.isArray(mappedObj?.exercises)
                        ? (mappedObj.exercises as Array<Record<string, unknown>>)
                        : []
                persistExerciseVideoUrls(resolved?.updates || [])
                setCurrentWorkout({
                    ...mappedObj,
                    exercises: exercises as unknown as Array<Record<string, unknown>>,
                } as unknown as ActiveSession)
            } catch {
                setCurrentWorkout(mapped as unknown as ActiveSession)
            }
            setView('edit')
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e || '')
            await alert('Erro ao carregar treino para edição: ' + msg)
        }
    }, [alert, persistExerciseVideoUrls, resolveExerciseVideos, setCurrentWorkout, setView])

    const handleSaveWorkout = useCallback(async (workoutToSave?: unknown) => {
        const wRaw = workoutToSave || currentWorkout
        const w = wRaw && typeof wRaw === 'object' ? (wRaw as Record<string, unknown>) : null
        if (!user || !w || !w.title) return { ok: false, error: 'Treino inválido ou usuário ausente' }
        try {
            if (w.id) {
                const res = await updateWorkout(String(w.id), w)
                setCurrentWorkout(
                    isRecord(wRaw)
                        ? (wRaw as unknown as ActiveSession)
                        : (w as unknown as ActiveSession)
                )
                return res
            } else {
                const created = await createWorkout(w)
                const id = created?.ok ? (created as unknown as { data: { id: string } }).data.id : null
                const baseObj: Record<string, unknown> = isRecord(wRaw)
                    ? (wRaw as Record<string, unknown>)
                    : w
                setCurrentWorkout({
                    ...baseObj,
                    id: id != null ? String(id) : undefined,
                } as unknown as ActiveSession)
                return created
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e || 'Falha ao salvar treino')
            return { ok: false, error: msg }
        }
    }, [currentWorkout, setCurrentWorkout, user]) as (workoutToSave?: unknown) => Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }>

    const handlePersistWorkoutTemplateFromSession = useCallback(async (workoutFromSession: unknown) => {
        try {
            const normalized = normalizeWorkoutForEditor(workoutFromSession)
            const cleaned = stripWorkoutInternalKeys(normalized)
            const cleanedObj = cleaned && typeof cleaned === 'object'
                ? (cleaned as Record<string, unknown>)
                : null
            if (!cleanedObj || !cleanedObj.title) return { ok: false, error: 'Treino inválido para salvar' }

            if (cleanedObj.id) {
                await updateWorkout(String(cleanedObj.id), cleanedObj)
                try { await fetchWorkouts() } catch { }
                return { ok: true, mode: 'update' }
            }

            const created = await createWorkout(cleanedObj)
            try { await fetchWorkouts() } catch { }
            return {
                ok: true,
                mode: 'create',
                id: (created as unknown as { ok: boolean; data?: { id: string } })?.ok
                    ? (created as unknown as { data: { id: string } }).data.id
                    : undefined,
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            return { ok: false, error: msg || 'Falha ao salvar treino' }
        }
    }, [fetchWorkouts, normalizeWorkoutForEditor, stripWorkoutInternalKeys])

    const handleOpenActiveWorkoutEditor = useCallback((options: Record<string, unknown> = {}) => {
        try {
            if (!activeSession?.workout) return
            const base = normalizeWorkoutForEditor(activeSession.workout)
            const shouldAddExercise = options && typeof options === 'object' ? !!options.addExercise : false
            editActiveAddExerciseRef.current = shouldAddExercise
            const nextBase = shouldAddExercise
                ? {
                    ...base,
                    exercises: [
                        ...(Array.isArray(base?.exercises) ? base.exercises : []),
                        {
                            name: '',
                            sets: 4,
                            reps: '10',
                            rpe: '8',
                            cadence: '2020',
                            restTime: 60,
                            method: 'Normal',
                            videoUrl: '',
                            notes: '',
                        },
                    ],
                }
                : base
            editActiveBaseRef.current = base
            setEditActiveDraft(nextBase)
            setEditActiveOpen(true)
        } catch { }
    }, [activeSession?.workout, editActiveAddExerciseRef, editActiveBaseRef, normalizeWorkoutForEditor, setEditActiveDraft, setEditActiveOpen])

    const handleCloseActiveWorkoutEditor = useCallback(() => {
        try {
            setEditActiveOpen(false)
            setEditActiveDraft(null)
            editActiveBaseRef.current = null
            editActiveAddExerciseRef.current = false
        } catch { }
    }, [editActiveAddExerciseRef, editActiveBaseRef, setEditActiveDraft, setEditActiveOpen])

    const handleSaveActiveWorkoutEditor = useCallback(async (workoutFromEditor: unknown) => {
        const normalized = normalizeWorkoutForEditor(workoutFromEditor)
        const cleaned = stripWorkoutInternalKeys(normalized)
        const shouldDeferPersist = !!editActiveAddExerciseRef.current
        const res = shouldDeferPersist ? { deferred: true } : await handleSaveWorkout(cleaned)
        setActiveSession((prev) => {
            if (!prev) return prev
            const oldWorkout =
                editActiveBaseRef.current || normalizeWorkoutForEditor(prev.workout)
            const nextLogs = reindexSessionLogsAfterWorkoutEdit(
                oldWorkout,
                normalized,
                prev.logs || {}
            ) as Record<string, unknown>
            const baseUi =
                prev?.ui && typeof prev.ui === 'object'
                    ? (prev.ui as Record<string, unknown>)
                    : {}
            const nextUi = shouldDeferPersist
                ? { ...baseUi, pendingTemplateUpdate: true }
                : baseUi
            return {
                ...prev,
                workout: normalized as unknown as ActiveSession,
                logs: nextLogs,
                ui: nextUi,
            }
        })
        editActiveBaseRef.current = normalized
        setEditActiveDraft(normalized)
        return res
    }, [
        editActiveAddExerciseRef,
        editActiveBaseRef,
        handleSaveWorkout,
        normalizeWorkoutForEditor,
        reindexSessionLogsAfterWorkoutEdit,
        setActiveSession,
        setEditActiveDraft,
        stripWorkoutInternalKeys,
    ])

    const handleDeleteWorkout = useCallback(async (id: string, title: unknown) => {
        const name = title || (workouts.find((w) => w.id === id)?.title) || 'este treino'
        if (!(await confirm(`Apagar o treino "${name}"?`, 'Excluir Treino'))) return
        try {
            const res = await deleteWorkout(id)
            if (!res?.ok) {
                await alert('Erro: ' + (res?.error || 'Falha ao excluir treino'))
                return
            }
            await fetchWorkouts()
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro: ' + message)
        }
    }, [alert, confirm, fetchWorkouts, workouts])

    const handleRestoreWorkout = useCallback(async (workout: unknown) => {
        const w = workout && typeof workout === 'object'
            ? (workout as Record<string, unknown>)
            : ({} as Record<string, unknown>)
        const id = String(w?.id || '').trim()
        if (!id) return
        const name = w?.title || 'este treino'
        if (!(await confirm(`Restaurar o treino "${name}"?`, 'Restaurar Treino'))) return
        try {
            const res = await setWorkoutArchived(id, false)
            if (!res?.ok) {
                await alert('Erro: ' + (res?.error || 'Falha ao restaurar treino'))
                return
            }
            await fetchWorkouts()
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro: ' + message)
        }
    }, [alert, confirm, fetchWorkouts])

    const handleBulkEditWorkouts = useCallback(async (items: unknown) => {
        try {
            const arr = Array.isArray(items) ? items : []
            if (!arr.length) return
            let updatedTitles = 0
            for (let i = 0; i < arr.length; i += 1) {
                const it = arr[i]
                const id = String(it?.id || '').trim()
                if (!id) continue
                const w = workouts.find((x) => String(x?.id || '') === id)
                if (!w) continue
                const desiredTitle =
                    String(it?.title || '').trim() || String(w?.title || 'Treino')
                if (desiredTitle !== String(w?.title || '')) {
                    const r = await updateWorkout(id, {
                        title: desiredTitle,
                        notes: w?.notes ?? '',
                        exercises: Array.isArray(w?.exercises) ? w.exercises : [],
                    })
                    if (!r?.ok) throw new Error(String(r?.error || 'Falha ao renomear treino'))
                    updatedTitles += 1
                }
            }

            let sortSaved = true
            let sortError = ''
            const sortIds = arr.map((it) => String(it?.id || '').trim()).filter(Boolean)
            const r2 = await setWorkoutSortOrder(sortIds)
            if (!r2?.ok) {
                sortSaved = false
                sortError = String(r2?.error || 'Falha ao ordenar treinos')
            }

            await fetchWorkouts()

            if (!sortSaved) {
                const suffix = sortError ? `\n\n${sortError}` : ''
                await alert(`Lista salva parcialmente: a ordenação não foi aplicada.${suffix}`)
                return
            }

            if (updatedTitles) {
                await alert(`Lista salva: ${updatedTitles} título(s) atualizado(s).`)
            } else {
                await alert('Lista salva.')
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao salvar lista: ' + message)
        }
    }, [alert, fetchWorkouts, workouts])

    return {
        handleStartSession,
        handleFinishSession,
        handleCreateWorkout,
        handleEditWorkout,
        handleSaveWorkout,
        handlePersistWorkoutTemplateFromSession,
        handleOpenActiveWorkoutEditor,
        handleCloseActiveWorkoutEditor,
        handleSaveActiveWorkoutEditor,
        handleDeleteWorkout,
        handleRestoreWorkout,
        handleBulkEditWorkouts,
    }
}
