import { useState, useCallback } from 'react'
import { ActiveSession, UserRecord } from '@/types/app'
import { workoutPlanHtml } from '@/utils/report/templates'
import { importData } from '@/actions/workout-actions'
import { getErrorMessage } from '@/utils/errorMessage'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

export type UseWorkoutExportOptions = {
    user: UserRecord | null
    workouts: Array<Record<string, unknown>>
    fetchWorkouts: () => Promise<void>
    alert: (msg: string, title?: string) => Promise<void>
    confirm: (msg: string, title?: string) => Promise<boolean>
}

export type UseWorkoutExportReturn = {
    exportWorkout: ActiveSession | null
    setExportWorkout: React.Dispatch<React.SetStateAction<ActiveSession | null>>
    showExportModal: boolean
    setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>
    exportingAll: boolean
    showImportModal: boolean
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>
    showJsonImportModal: boolean
    setShowJsonImportModal: React.Dispatch<React.SetStateAction<boolean>>
    importCode: string
    setImportCode: React.Dispatch<React.SetStateAction<string>>
    shareCode: string | null
    setShareCode: React.Dispatch<React.SetStateAction<string | null>>
    handleShareWorkout: (workout: unknown) => void
    handleExportPdf: () => Promise<void>
    handleExportJson: () => void
    handleExportAllWorkouts: () => Promise<void>
    handleImportWorkout: () => Promise<void>
    handleJsonUpload: (e: unknown) => void
}

export function useWorkoutExport({
    user,
    workouts,
    fetchWorkouts,
    alert,
    confirm,
}: UseWorkoutExportOptions): UseWorkoutExportReturn {
    const [exportWorkout, setExportWorkout] = useState<ActiveSession | null>(null)
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportingAll, setExportingAll] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const [showJsonImportModal, setShowJsonImportModal] = useState(false)
    const [importCode, setImportCode] = useState('')
    const [shareCode, setShareCode] = useState<string | null>(null)

    const handleShareWorkout = useCallback((workout: unknown) => {
        setExportWorkout(isRecord(workout) ? (workout as unknown as ActiveSession) : null)
        setShowExportModal(true)
    }, [])

    const handleExportPdf = useCallback(async () => {
        if (!exportWorkout || !user) return
        try {
            const html = workoutPlanHtml(exportWorkout as Record<string, unknown>, user)
            const win = window.open('', '_blank')
            if (!win) return
            win.document.open()
            win.document.write(html)
            win.document.close()
            win.focus()
            setTimeout(() => {
                try { win.print() } catch { }
            }, 300)
            setShowExportModal(false)
        } catch (e) {
            await alert('Erro ao gerar PDF: ' + getErrorMessage(e))
        }
    }, [exportWorkout, user, alert])

    const handleExportJson = useCallback(() => {
        if (!exportWorkout) return
        const json = JSON.stringify(
            {
                workout: {
                    title: exportWorkout.title,
                    exercises: (exportWorkout.exercises || []).map((ex: unknown) => {
                        const e = isRecord(ex) ? ex : ({} as Record<string, unknown>)
                        return {
                            name: e.name,
                            sets: e.sets,
                            reps: e.reps,
                            rpe: e.rpe,
                            cadence: e.cadence,
                            restTime: e.restTime,
                            method: e.method,
                            videoUrl: e.videoUrl,
                            notes: e.notes,
                        }
                    }),
                },
            },
            null,
            2
        )
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(exportWorkout.title || 'treino').replace(/\s+/g, '_')}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        setShowExportModal(false)
    }, [exportWorkout])

    const handleExportAllWorkouts = useCallback(async () => {
        try {
            setExportingAll(true)
            const payload = {
                user: { id: user?.id || '', email: user?.email || '' },
                workouts: (workouts || []).map((w: Record<string, unknown>) => ({
                    id: w.id,
                    title: w.title,
                    notes: w.notes,
                    is_template: true,
                    exercises: (Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []).map(
                        (ex: unknown) => {
                            const e = isRecord(ex) ? ex : ({} as Record<string, unknown>)
                            return {
                                name: e.name,
                                sets: e.sets,
                                reps: e.reps,
                                rpe: e.rpe,
                                cadence: e.cadence,
                                restTime: e.restTime,
                                method: e.method,
                                videoUrl: e.videoUrl,
                                notes: e.notes,
                            }
                        }
                    ),
                })),
            }
            const json = JSON.stringify(payload, null, 2)
            const blob = new Blob([json], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `irontracks_workouts_${new Date().toISOString()}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        } catch {
            // silencioso — export não critico
        } finally {
            setExportingAll(false)
        }
    }, [user, workouts])

    const handleImportWorkout = useCallback(async () => {
        await alert(
            'Funcionalidade de importar código temporariamente indisponível na migração.',
            'Em Manutenção'
        )
    }, [alert])

    const handleJsonUpload = useCallback(
        (e: unknown) => {
            const input = (e as { target?: HTMLInputElement | null })?.target ?? null
            const file = input?.files?.[0]
            if (!file) return
            try {
                setShowJsonImportModal(false)
            } catch { }

            const reader = new FileReader()
            reader.onload = async (event: ProgressEvent<FileReader>) => {
                try {
                    const json = JSON.parse(String(event?.target?.result || ''))
                    if (
                        await confirm(
                            `Importar dados de ${json.user?.email || 'Unknown'}? Isso criará novos treinos.`,
                            'Importar Backup'
                        )
                    ) {
                        await importData(json)
                        await fetchWorkouts()
                        await alert('Dados importados com sucesso!', 'Sucesso')
                    }
                } catch (err) {
                    await alert('Erro ao ler arquivo JSON: ' + getErrorMessage(err))
                } finally {
                    try {
                        if (input) input.value = ''
                    } catch { }
                }
            }
            reader.readAsText(file)
        },
        [fetchWorkouts, alert, confirm]
    )

    return {
        exportWorkout,
        setExportWorkout,
        showExportModal,
        setShowExportModal,
        exportingAll,
        showImportModal,
        setShowImportModal,
        showJsonImportModal,
        setShowJsonImportModal,
        importCode,
        setImportCode,
        shareCode,
        setShareCode,
        handleShareWorkout,
        handleExportPdf,
        handleExportJson,
        handleExportAllWorkouts,
        handleImportWorkout,
        handleJsonUpload,
    }
}
