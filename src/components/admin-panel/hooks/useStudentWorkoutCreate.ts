'use client'

import { useState, useCallback, useRef } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminUser } from '@/types/admin'
import type { UnknownRecord } from '@/types/app'
import { apiAi } from '@/lib/api'
import { useDialog } from '@/contexts/DialogContext'
import type { WorkoutWizardAnswers, WorkoutDraft } from '@/components/dashboard/WorkoutWizardModal'

type MaybePromise<T> = T | Promise<T>
type GenerateMode = 'single' | 'program'
type GenerateResult = WorkoutDraft | { drafts: WorkoutDraft[] }

interface UseStudentWorkoutCreateOptions {
    selectedStudent: AdminUser | null
    user: AdminUser
    supabase: SupabaseClient
    setStudentWorkouts: React.Dispatch<React.SetStateAction<UnknownRecord[]>>
    setSyncedWorkouts: React.Dispatch<React.SetStateAction<UnknownRecord[]>>
    setEditingStudentWorkout: (w: UnknownRecord | null) => void
}

export function useStudentWorkoutCreate({
    selectedStudent,
    user,
    supabase,
    setStudentWorkouts,
    setSyncedWorkouts,
    setEditingStudentWorkout,
}: UseStudentWorkoutCreateOptions) {
    const { alert } = useDialog()

    // ── Wizard modal state ─────────────────────────────────────────────────────
    const [wizardOpen, setWizardOpen] = useState(false)

    // ── Tools panel (dropdown) state ───────────────────────────────────────────
    const [toolsPanelOpen, setToolsPanelOpen] = useState(false)

    // ── JSON import state ──────────────────────────────────────────────────────
    const [jsonImportOpen, setJsonImportOpen] = useState(false)
    const jsonFileInputRef = useRef<HTMLInputElement | null>(null)

    // ── Iron Scanner state (placeholder – opens scanner if component exists) ───
    const [ironScannerOpen, setIronScannerOpen] = useState(false)

    // ─── Derived helpers ───────────────────────────────────────────────────────

    /** Save a single WorkoutDraft directly to DB as a student workout */
    const saveWorkoutDraftToStudent = useCallback(
        async (draft: WorkoutDraft) => {
            if (!selectedStudent) return { ok: false, error: 'Nenhum aluno selecionado' }
            const targetUserId = String(selectedStudent.user_id || '').trim()
            if (!targetUserId) return { ok: false, error: 'Aluno sem acesso ao app' }

            try {
                const { data: newWorkout, error: wErr } = await supabase
                    .from('workouts')
                    .insert({
                        user_id: targetUserId,
                        created_by: user?.id,
                        is_template: true,
                        name: draft.title || 'Treino',
                        notes: '',
                    })
                    .select()
                    .single()
                if (wErr) throw wErr

                const exercises = Array.isArray(draft.exercises) ? draft.exercises as UnknownRecord[] : []
                if (exercises.length) {
                    const toInsert = exercises.map((ex) => ({
                        workout_id: newWorkout.id,
                        name: String(ex?.name || ''),
                        sets: Number(ex?.sets) || 3,
                        reps: ex?.reps ?? '8-12',
                        rpe: ex?.rpe ?? 8,
                        cadence: ex?.cadence || '2020',
                        rest_time: Number(ex?.restTime ?? ex?.rest_time) || 60,
                        method: ex?.method || 'Normal',
                        video_url: String(ex?.videoUrl || ex?.video_url || ''),
                        notes: String(ex?.notes || ''),
                    }))
                    const { error: exErr } = await supabase.from('exercises').insert(toInsert)
                    if (exErr) throw exErr
                }

                return { ok: true }
            } catch (e: unknown) {
                const msg =
                    e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
                        ? (e as { message: string }).message
                        : String(e)
                return { ok: false, error: msg }
            }
        },
        [selectedStudent, supabase, user]
    )

    /** Refresh student workouts from DB after creating */
    const refreshStudentWorkouts = useCallback(async () => {
        if (!selectedStudent) return
        const targetUserId = String(selectedStudent.user_id || '').trim()
        if (!targetUserId) return
        try {
            const { data } = await supabase
                .from('workouts')
                .select('*, exercises(*, sets(*))')
                .eq('user_id', targetUserId)
                .eq('is_template', true)
                .order('name')
            const rows = Array.isArray(data) ? (data as UnknownRecord[]) : []
            const synced = rows.filter(
                (w) =>
                    String(w?.created_by || '') === String(user.id) &&
                    String(w?.user_id || '') === String(targetUserId)
            )
            const syncedIds = new Set(synced.map((w) => w?.id).filter(Boolean))
            const others = rows.filter((w) => !syncedIds.has(w?.id))
            setStudentWorkouts(others)
            setSyncedWorkouts(synced)
        } catch { /* silenced */ }
    }, [selectedStudent, supabase, user, setStudentWorkouts, setSyncedWorkouts])

    // ─── Wizard callbacks ──────────────────────────────────────────────────────

    /**
     * Called by WorkoutWizardModal → runs the AI generation.
     * Returns the raw response which the modal handles to show "draft".
     */
    const onWizardGenerate = useCallback(
        async (answers: WorkoutWizardAnswers, options?: { mode?: GenerateMode }): Promise<GenerateResult> => {
            const mode = options?.mode ?? 'single'
            const res = await apiAi.workoutWizard({ answers, mode })
            // Return shape matches what WorkoutWizardModal expects
            if (mode === 'program') {
                const drafts = Array.isArray((res as UnknownRecord)?.drafts)
                    ? ((res as UnknownRecord).drafts as WorkoutDraft[])
                    : []
                return { drafts }
            }
            const draft = (res as UnknownRecord)?.draft as WorkoutDraft | undefined
            return draft ?? { title: 'Treino', exercises: [] }
        },
        []
    )

    /**
     * Called when user clicks "Abrir no editor" in the wizard.
     * Pre-fills the AdminWorkoutEditor with the AI draft.
     */
    const onWizardUseDraft = useCallback(
        (draft: WorkoutDraft) => {
            setEditingStudentWorkout({
                id: null,
                title: draft.title || '',
                exercises: (Array.isArray(draft.exercises) ? draft.exercises as UnknownRecord[] : []).map((ex) => ({
                    name: String(ex?.name || ''),
                    sets: Number(ex?.sets) || 3,
                    reps: ex?.reps ?? '8-12',
                    rpe: ex?.rpe ?? 8,
                    cadence: ex?.cadence || '2020',
                    restTime: Number(ex?.restTime ?? ex?.rest_time) || 60,
                    method: ex?.method || 'Normal',
                    videoUrl: String(ex?.videoUrl || ex?.video_url || ''),
                    notes: String(ex?.notes || ''),
                    coachNotes: '',
                })),
            })
        },
        [setEditingStudentWorkout]
    )

    /**
     * Called for "Plano semanal" → Salvar todos.
     * Saves each draft directly to the student's account.
     */
    const onWizardSaveDrafts = useCallback(
        async (drafts: WorkoutDraft[]): Promise<void> => {
            if (!selectedStudent) {
                await alert('Nenhum aluno selecionado.')
                return
            }
            const targetUserId = String(selectedStudent.user_id || '').trim()
            if (!targetUserId) {
                await alert('Este aluno ainda não possui acesso ao app. Solicite que ele faça o cadastro primeiro.')
                return
            }
            let saved = 0
            for (const draft of drafts) {
                const res = await saveWorkoutDraftToStudent(draft)
                if (res.ok) saved++
            }
            await refreshStudentWorkouts()
            await alert(`${saved} treino(s) salvo(s) para o aluno!`, 'Sucesso')
        },
        [alert, selectedStudent, saveWorkoutDraftToStudent, refreshStudentWorkouts]
    )

    // ─── JSON import handler ───────────────────────────────────────────────────

    const handleJsonImport = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (!file) return
            // Reset the input so the same file can be re-selected
            if (jsonFileInputRef.current) jsonFileInputRef.current.value = ''
            try {
                const text = await file.text()
                const parsed = JSON.parse(text) as UnknownRecord
                // Support both { workout: {...} } and direct workout objects
                const raw = (parsed?.workout && typeof parsed.workout === 'object'
                    ? parsed.workout
                    : parsed) as UnknownRecord
                const title = String(raw?.title || raw?.name || '').trim() || 'Treino Importado'
                const exercises = Array.isArray(raw?.exercises) ? raw.exercises as UnknownRecord[] : []
                setEditingStudentWorkout({
                    id: null,
                    title,
                    exercises: exercises.map((ex) => ({
                        name: String(ex?.name || ''),
                        sets: Number(ex?.sets) || 3,
                        reps: ex?.reps ?? '8-12',
                        rpe: ex?.rpe ?? 8,
                        cadence: ex?.cadence || '2020',
                        restTime: Number(ex?.restTime ?? ex?.rest_time) || 60,
                        method: ex?.method || 'Normal',
                        videoUrl: String(ex?.videoUrl || ex?.video_url || ''),
                        notes: String(ex?.notes || ''),
                        coachNotes: String(ex?.coachNotes || ''),
                    })),
                })
            } catch {
                await alert('Erro ao ler o arquivo JSON. Verifique se é um arquivo de treino válido.')
            }
        },
        [alert, setEditingStudentWorkout]
    )

    const openJsonImport = useCallback<() => MaybePromise<void>>(() => {
        jsonFileInputRef.current?.click()
    }, [])

    return {
        // State
        wizardOpen, setWizardOpen,
        toolsPanelOpen, setToolsPanelOpen,
        jsonImportOpen, setJsonImportOpen,
        ironScannerOpen, setIronScannerOpen,
        jsonFileInputRef,
        // Wizard callbacks
        onWizardGenerate,
        onWizardUseDraft,
        onWizardSaveDrafts,
        // JSON import
        handleJsonImport,
        openJsonImport,
        // Utils
        refreshStudentWorkouts,
        saveWorkoutDraftToStudent,
    }
}
