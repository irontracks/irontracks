/**
 * @module useWorkoutExport
 *
 * Handles exporting and importing workouts. Export generates a
 * downloadable HTML or JSON file; import parses an uploaded file
 * and creates the workout via server actions. Supports both
 * single-workout and bulk-import modes.
 *
 * @returns `{ exportWorkout, importWorkout, exporting, importing, error }`
 */
import { logWarn } from '@/lib/logger'
import { useState, useCallback } from 'react'
import { exportHtmlAsPdf } from '@/utils/report/exportHtmlAsPdf'
import { ActiveSession, UserRecord } from '@/types/app'
import { workoutPlanHtml } from '@/utils/report/templates'
import { importData } from '@/actions/workout-actions'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonWithSchema } from '@/utils/zod'
import { exportJsonFile } from '@/utils/export/exportJsonFile'
import { buildWorkoutBackup, buildSingleWorkoutBackup, parseWorkoutBackup } from '@/utils/export/workoutBackupPayload'
import { z } from 'zod'
import type { ConfirmFn } from '@/contexts/DialogContext'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

export type UseWorkoutExportOptions = {
    user: UserRecord | null
    workouts: Array<Record<string, unknown>>
    fetchWorkouts: () => Promise<void>
    alert: (msg: string, title?: string) => Promise<void>
    confirm: ConfirmFn
}

export type UseWorkoutExportReturn = {
    exportWorkout: ActiveSession | null
    setExportWorkout: React.Dispatch<React.SetStateAction<ActiveSession | null>>
    showExportModal: boolean
    setShowExportModal: React.Dispatch<React.SetStateAction<boolean>>
    exportingAll: boolean
    showJsonImportModal: boolean
    setShowJsonImportModal: React.Dispatch<React.SetStateAction<boolean>>
    shareCode: string | null
    setShareCode: React.Dispatch<React.SetStateAction<string | null>>
    handleShareWorkout: (workout: unknown) => void
    handleExportPdf: () => Promise<void>
    handleExportJson: () => Promise<void>
    handleExportAllWorkouts: () => Promise<void>
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
    const [showJsonImportModal, setShowJsonImportModal] = useState(false)
    const [shareCode, setShareCode] = useState<string | null>(null)

    const handleShareWorkout = useCallback((workout: unknown) => {
        setExportWorkout(isRecord(workout) ? (workout as unknown as ActiveSession) : null)
        setShowExportModal(true)
    }, [])

    const handleExportPdf = useCallback(async () => {
        if (!exportWorkout || !user) return
        try {
            const html = workoutPlanHtml(exportWorkout as Record<string, unknown>, user)
            const title = String((exportWorkout as Record<string, unknown>)?.title || 'treino').trim() || 'treino'

            // Caminho único de export — ver utils/report/exportHtmlAsPdf. O fallback
            // antigo compartilhava uma `blob:` URL, que no iOS acabava
            // compartilhando a página atual do app em vez do plano.
            await exportHtmlAsPdf({
                html,
                title,
                baseFileName: `${title.replace(/\s+/g, '_')}_irontracks`,
                alert: (msg: string) => { void alert(msg) },
            })
            setShowExportModal(false)
        } catch (e) {
            await alert('Erro ao gerar PDF: ' + getErrorMessage(e))
        }
    }, [exportWorkout, user, alert])

    const handleExportJson = useCallback(async () => {
        if (!exportWorkout) return
        // Formato v2 (com setDetails): o backup de um treino leva peso, reps,
        // RPE e `advanced_config` de cada série — sem isso um Drop-set voltava
        // sem as etapas. Entrega pelo caminho nativo: `<a download>` não baixa
        // nada no WebView do iOS.
        const backup = buildSingleWorkoutBackup(
            user ? { id: user.id, email: user.email } : null,
            exportWorkout,
            new Date().toISOString(),
        )
        const title = String((exportWorkout as unknown as Record<string, unknown>)?.title || 'treino').trim() || 'treino'
        const res = await exportJsonFile({
            json: JSON.stringify(backup, null, 2),
            baseFileName: title,
            title: `${title} • IronTracks`,
            alert: (msg: string) => { void alert(msg) },
        })
        if (res.ok || res.via === 'cancelled') setShowExportModal(false)
    }, [exportWorkout, user, alert])

    const handleExportAllWorkouts = useCallback(async () => {
        try {
            setExportingAll(true)
            const backup = buildWorkoutBackup(
                user ? { id: user.id, email: user.email } : null,
                workouts,
                new Date().toISOString(),
            )
            const res = await exportJsonFile({
                json: JSON.stringify(backup, null, 2),
                baseFileName: `irontracks_treinos_${new Date().toISOString().slice(0, 10)}`,
                title: 'Backup de treinos • IronTracks',
                alert: (msg: string) => { void alert(msg) },
            })
            // Falha silenciosa era o defeito original: o usuário tocava e nada
            // acontecia — nem arquivo, nem erro.
            if (!res.ok && res.via === 'failed') {
                await alert('Não consegui gerar o backup: ' + (res.error || 'erro desconhecido'))
            }
        } catch (e) {
            await alert('Não consegui gerar o backup: ' + getErrorMessage(e))
        } finally {
            setExportingAll(false)
        }
    }, [user, workouts, alert])

    // "Importar por CÓDIGO" foi removido em 19/08/2026: o modal não tinha
    // nenhum acionador na UI (`setShowImportModal(true)` não era chamado em
    // lugar nenhum) e o handler respondia "temporariamente indisponível na
    // migração" desde então. Restaurar treino é pelo arquivo .json.

    const handleJsonUpload = useCallback(
        (e: unknown) => {
            const input = (e as { target?: HTMLInputElement | null })?.target ?? null
            const file = input?.files?.[0]
            if (!file) return
            try {
                setShowJsonImportModal(false)
            } catch (e) { logWarn('useWorkoutExport', 'silenced error', e) }

            const reader = new FileReader()
            reader.onload = async (event: ProgressEvent<FileReader>) => {
                try {
                    const json = parseJsonWithSchema(String(event?.target?.result || ''), z.record(z.unknown()))
                    if (!json) throw new Error('invalid_json')
                    const jsonObj = json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
                    const userObj = jsonObj.user && typeof jsonObj.user === 'object' ? (jsonObj.user as Record<string, unknown>) : {}
                    const parsed = parseWorkoutBackup(jsonObj)
                    if (!parsed.workouts.length) throw new Error('nenhum treino no arquivo')
                    if (
                        await confirm(
                            `Importar ${parsed.workouts.length} treino(s) de ${String(userObj.email || 'origem desconhecida')}? Isso criará novos treinos.`,
                            'Importar Backup'
                        )
                    ) {
                        // `parseWorkoutBackup` aceita o formato antigo E o novo —
                        // quem exportou antes do v2 continua conseguindo restaurar.
                        await importData({ workouts: parsed.workouts })
                        await fetchWorkouts()
                        await alert('Dados importados com sucesso!', 'Sucesso')
                    }
                } catch (err) {
                    await alert('Erro ao ler arquivo JSON: ' + getErrorMessage(err))
                } finally {
                    try {
                        if (input) input.value = ''
                    } catch (e) { logWarn('useWorkoutExport', 'silenced error', e) }
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
        showJsonImportModal,
        setShowJsonImportModal,
        shareCode,
        setShareCode,
        handleShareWorkout,
        handleExportPdf,
        handleExportJson,
        handleExportAllWorkouts,
        handleJsonUpload,
    }
}
