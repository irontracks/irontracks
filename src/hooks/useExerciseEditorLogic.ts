import { useCallback } from 'react'
import { useDialog } from '@/contexts/DialogContext'
import { createClient } from '@/utils/supabase/client'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { detectCardioFromScanner, detectRestPauseConfig, extractRepsTargets } from '@/utils/training/scannerDetection'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import type { SetDetail, Exercise, Workout } from '@/components/ExerciseEditor/types'

interface UseExerciseEditorLogicParams {
    workout: Workout
    onSave?: (workout: Workout) => Promise<unknown>
    onCancel?: () => void
    onChange?: (workout: Workout) => void
    onSaved?: () => void
    saving: boolean
    setSaving: (v: boolean) => void
    setScannerLoading: (v: boolean) => void
    setScannerError: (v: string) => void
    fileInputRef: React.RefObject<HTMLInputElement>
    scannerFileInputRef: React.RefObject<HTMLInputElement>
    normalizeMethod: (method: unknown) => string
    buildDefaultSetDetail: (exercise: Exercise, setNumber: number) => SetDetail
    ensureSetDetails: (exercise: Exercise, desiredCount: number) => SetDetail[]
}

export function useExerciseEditorLogic({
    workout,
    onSave, onCancel, onChange, onSaved,
    saving, setSaving,
    setScannerLoading, setScannerError,
    fileInputRef, scannerFileInputRef,
    normalizeMethod, buildDefaultSetDetail, ensureSetDetails,
}: UseExerciseEditorLogicParams) {
    const { confirm, alert, closeDialog, showLoading } = useDialog()

    const getExerciseType = useCallback((ex: Exercise): 'cardio' | 'strength' => {
        if (ex.type) return ex.type as 'cardio' | 'strength'
        return ex.method === 'Cardio' ? 'cardio' : 'strength'
    }, [])

    const updateSetDetail = useCallback((exerciseIndex: number, setIndex: number, patch: Partial<SetDetail>) => {
        const newExercises = [...(workout.exercises || [])]
        const ex = newExercises[exerciseIndex] || ({} as Exercise)
        const setsCount = Math.max(0, parseInt(String(ex?.sets)) || 0)
        const setDetails = ensureSetDetails(ex, setsCount)
        const current = setDetails[setIndex] || buildDefaultSetDetail(ex, setIndex + 1)
        const next = { ...current, ...patch }
        setDetails[setIndex] = next
        if (Object.prototype.hasOwnProperty.call(patch || {}, 'is_warmup')) {
            if (setIndex !== 0 && next.is_warmup) setDetails[setIndex] = { ...next, is_warmup: false }
            if (setIndex === 0 && next.is_warmup) {
                for (let i = 1; i < setDetails.length; i += 1) {
                    const other = setDetails[i] || buildDefaultSetDetail(ex, i + 1)
                    setDetails[i] = { ...other, is_warmup: false }
                }
            }
        }
        newExercises[exerciseIndex] = { ...ex, setDetails }
        onChange?.({ ...workout, exercises: newExercises })
    }, [workout, onChange, ensureSetDetails, buildDefaultSetDetail])

    const updateExercise = useCallback((index: number, field: keyof Exercise | 'duplicate', value: unknown) => {
        const newExercises = [...(workout.exercises || [])]
        if (field === 'duplicate') {
            newExercises.splice(index + 1, 0, { ...newExercises[index] })
        } else {
            const ex = newExercises[index] || ({} as Exercise)
            if (field === 'sets') {
                const nextCount = Math.max(0, parseInt(String(value ?? '')) || 0)
                newExercises[index] = { ...ex, sets: value as string | number, setDetails: ensureSetDetails(ex, nextCount) }
            } else if (field === 'method') {
                const prevMethod = normalizeMethod(ex?.method)
                const nextMethod = normalizeMethod(String(value ?? ''))
                const currentCount = Math.max(0, parseInt(String(ex?.sets)) || 0)
                const nextIsSpecial = nextMethod === 'Drop-set' || nextMethod === 'Rest-Pause' || nextMethod === 'Cluster'
                const prevIsSpecial = prevMethod === 'Drop-set' || prevMethod === 'Rest-Pause' || prevMethod === 'Cluster'
                const setsCount = nextIsSpecial ? Math.max(1, currentCount || 1) : (currentCount || 4)
                const switchingBetweenSpecial = prevIsSpecial && nextIsSpecial && prevMethod !== nextMethod
                const shouldResetConfig = nextMethod === 'Normal' || nextMethod === 'Bi-Set' || nextMethod === 'Cardio' || switchingBetweenSpecial
                const baseDetails = ensureSetDetails({ ...ex, method: nextMethod }, setsCount)
                const nextDetails = shouldResetConfig ? baseDetails.map(s => ({ ...s, advanced_config: null })) : baseDetails
                const currentRestTimeNum = Number(ex?.restTime ?? ex?.rest_time ?? NaN)
                const shouldSuggestRestZero = nextMethod === 'Bi-Set' && (!Number.isFinite(currentRestTimeNum) || currentRestTimeNum === 60)
                newExercises[index] = { ...ex, method: nextMethod, restTime: shouldSuggestRestZero ? 0 : (ex?.restTime ?? ex?.rest_time ?? null), sets: setsCount, setDetails: nextDetails }
            } else {
                newExercises[index] = { ...ex, [field]: value as Exercise[keyof Exercise] }
            }
        }
        onChange?.({ ...workout, exercises: newExercises })
    }, [workout, onChange, normalizeMethod, ensureSetDetails])

    const removeExercise = useCallback(async (index: number) => {
        if (await confirm('Tem certeza que deseja remover este exercício?', 'Remover Exercício')) {
            const newExercises = [...(workout.exercises || [])]
            newExercises.splice(index, 1)
            onChange?.({ ...workout, exercises: newExercises })
        }
    }, [workout, onChange, confirm])

    const handleCancel = useCallback(async () => {
        if (await confirm('Deseja mesmo cancelar?', 'Cancelar Edição')) onCancel?.()
    }, [confirm, onCancel])

    const addExercise = useCallback(() => {
        onChange?.({
            ...workout,
            exercises: [...(workout.exercises || []), { name: '', sets: 4, reps: '10', rpe: '8', cadence: '2020', restTime: 60, method: 'Normal', videoUrl: '', notes: '' }]
        })
    }, [workout, onChange])

    const toggleExerciseType = useCallback((index: number, currentType: string) => {
        const newType = currentType === 'strength' ? 'cardio' : 'strength'
        const newExercises = [...(workout.exercises || [])]
        const ex = newExercises[index]
        if (!ex) return
        const CARDIO_OPTIONS = ['Escada', 'Esteira', 'Bicicleta', 'Bike Outdoor', 'Corrida', 'Caminhada', 'Elíptico']
        if (newType === 'cardio') {
            newExercises[index] = { ...ex, type: 'cardio', method: 'Cardio', sets: 1, name: CARDIO_OPTIONS.includes(ex.name) ? ex.name : 'Esteira', reps: ex.reps || '20', rpe: ex.rpe || 5, setDetails: [] }
        } else {
            newExercises[index] = { ...ex, type: 'strength', method: 'Normal', sets: 4, name: '', reps: '10', rpe: 8 }
        }
        onChange?.({ ...workout, exercises: newExercises })
    }, [workout, onChange])

    const toggleBiSetWithNext = useCallback(async (index: number) => {
        try {
            const list = Array.isArray(workout?.exercises) ? workout.exercises : []
            const current = list[index]
            const next = list[index + 1]
            if (!current || !next) return
            const currentType = getExerciseType(current)
            const nextType = getExerciseType(next)
            if (currentType === 'cardio' || nextType === 'cardio') { await alert('Bi-set só pode ser usado entre exercícios de força.', 'Atenção'); return }
            const currentMethod = normalizeMethod(current?.method)
            if (currentMethod === 'Bi-Set') { updateExercise(index, 'method', 'Normal'); return }
            const allowedMethods = new Set(['Normal', 'Bi-Set'])
            if (!allowedMethods.has(currentMethod)) {
                const ok = await confirm('Isso vai trocar o método para Bi-Set. Continuar?', 'Linkar com Próximo')
                if (!ok) return
            }
            updateExercise(index, 'method', 'Bi-Set')
        } catch (e: unknown) {
            await alert('Não foi possível atualizar o link. ' + (getErrorMessage(e) ?? String(e)), 'Erro')
        }
    }, [workout, getExerciseType, normalizeMethod, updateExercise, alert, confirm])

    const handleScannerFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            setScannerError('')
            const files = e?.target?.files
            if (!files || files.length === 0) return
            const selectedFiles = Array.from(files).filter((f) => !!f) as File[]
            if (selectedFiles.length === 0) return
            setScannerLoading(true)
            const allRawExercises: unknown[] = []
            let detectedTitle = ''
            for (let i = 0; i < selectedFiles.length; i += 1) {
                const file = selectedFiles[i] as File
                const formData = new FormData()
                formData.append('file', file)
                const res = await fetch('/api/iron-scanner', { method: 'POST', body: formData })
                const json = await res.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor' }))
                if (!res.ok || !json?.ok) {
                    const msg = json?.error || 'Não conseguimos ler o treino. Tente uma foto mais nítida.'
                    setScannerError(msg); await alert(msg, 'Falha na importação'); return
                }
                const titleCandidate = String(json?.workoutTitle ?? '').trim()
                if (!detectedTitle && titleCandidate) detectedTitle = titleCandidate
                const list = Array.isArray(json.exercises) ? json.exercises : []
                if (list.length === 0) {
                    const msg = 'Não encontramos exercícios válidos em uma das imagens.'
                    setScannerError(msg); await alert(msg, 'Sem exercícios detectados'); return
                }
                allRawExercises.push(...list)
            }
            if (allRawExercises.length === 0) {
                const msg = 'Não encontramos exercícios válidos nas imagens selecionadas.'
                setScannerError(msg); await alert(msg, 'Sem exercícios válidos'); return
            }
            const mappedExercises = (allRawExercises as Record<string, unknown>[]).map((item) => {
                const rawName = String(item?.name || '').trim()
                const canonical = resolveCanonicalExerciseName(rawName)
                const name = String(canonical?.canonical || rawName).trim()
                const setsNum = typeof item?.sets === 'number' ? item.sets : parseInt(String(item?.sets || '0')) || 0
                const repsRaw = String(item?.reps ?? '').trim()
                const notesRaw = String(item?.notes ?? '').trim()
                const baseSets = Number.isFinite(setsNum) && setsNum > 0 ? setsNum : 4
                const cardioInfo = detectCardioFromScanner(name, repsRaw, notesRaw)
                if (cardioInfo) {
                    const minutesStr = String(cardioInfo.minutes)
                    const exercise: Exercise = { name: cardioInfo.modality, type: 'cardio', method: 'Cardio', sets: 1, reps: minutesStr, rpe: '5', cadence: '', restTime: 0, videoUrl: '', notes: notesRaw }
                    const setDetails = ensureSetDetails(exercise, 1)
                    setDetails[0] = { ...(setDetails[0] || buildDefaultSetDetail(exercise, 1)), reps: minutesStr }
                    return { ...exercise, setDetails }
                }
                const restPauseInfo = detectRestPauseConfig(name, repsRaw, notesRaw)
                const method = restPauseInfo?.method || 'Normal'
                const reps = restPauseInfo?.normalizedReps || repsRaw || '10'
                const notes = restPauseInfo?.cleanedNotes ?? notesRaw
                const exercise: Exercise = { name, sets: baseSets, reps, rpe: '8', cadence: '2020', restTime: 60, method, videoUrl: '', notes }
                const setDetails = ensureSetDetails(exercise, baseSets)
                const repsTargets = extractRepsTargets(reps, notesRaw)
                for (let i = 0; i < setDetails.length; i += 1) {
                    const target = repsTargets[i]; if (!target) continue
                    const sd = setDetails[i] || buildDefaultSetDetail(exercise, i + 1)
                    setDetails[i] = { ...sd, reps: target }
                }
                if (method === 'Rest-Pause' && restPauseInfo?.config && setDetails.length > 0) {
                    const lastIndex = setDetails.length - 1
                    const last = setDetails[lastIndex] || buildDefaultSetDetail(exercise, lastIndex + 1)
                    setDetails[lastIndex] = { ...last, advanced_config: { ...(last.advanced_config && typeof last.advanced_config === 'object' ? last.advanced_config : {}), ...restPauseInfo.config } }
                }
                return { ...exercise, setDetails }
            }).filter((ex) => String(ex.name || '').trim().length > 0)
            if (!mappedExercises.length) {
                const msg = 'Não encontramos exercícios utilizáveis nas imagens.'
                setScannerError(msg); await alert(msg, 'Sem exercícios válidos'); return
            }
            let titleToApply = ''
            if (detectedTitle) {
                try { const ok = await confirm(`Definir título como "${detectedTitle}"?`, 'Scanner'); if (ok) titleToApply = detectedTitle } catch { }
            }
            try {
                const preview = mappedExercises.slice(0, 10).map((x) => `• ${String(x?.name || '').trim()}`).join('\n')
                const ok = await confirm(`Importar ${mappedExercises.length} exercício(s)?\n\n${preview}${mappedExercises.length > 10 ? '\n…' : ''}`, 'Scanner')
                if (!ok) return
            } catch { }
            onChange?.({ ...(workout || {}), ...(titleToApply ? { title: titleToApply } : {}), exercises: mappedExercises })
            await alert('Treino importado pela IA. Revise antes de salvar.', 'Importação concluída')
        } catch (err: unknown) {
            const msg = getErrorMessage(err) ? String(getErrorMessage(err)) : String(err)
            setScannerError(msg || 'Não conseguimos ler o treino. Tente uma foto mais nítida.')
            await alert(msg || 'Não conseguimos ler o treino. Tente uma foto mais nítida.', 'Erro na importação')
        } finally {
            setScannerLoading(false)
            if (e?.target) e.target.value = ''
        }
    }, [workout, onChange, setScannerLoading, setScannerError, ensureSetDetails, buildDefaultSetDetail, alert, confirm])

    const handleImportJson = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return
        try {
            const text = await file.text()
            const raw = parseJsonWithSchema(text, z.record(z.unknown()))
            if (!raw) throw new Error('invalid_json')
            const rawObj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
            const src = (rawObj.workout && typeof rawObj.workout === 'object') ? (rawObj.workout as Record<string, unknown>)
                : (rawObj.session && typeof rawObj.session === 'object') ? (rawObj.session as Record<string, unknown>) : rawObj
            const title = String(src.title ?? src.workoutTitle ?? workout.title ?? 'Treino Importado')
            const exs = Array.isArray(src.exercises) ? src.exercises : []
            const mapped = exs.map((ex: Record<string, unknown>) => ({
                name: String(ex.name || ''),
                sets: Number(ex.sets) || (Array.isArray(ex?.setDetails) ? ex.setDetails.length : 0),
                reps: String(ex.reps || ''),
                rpe: Number(ex.rpe || ex.intensity || 8),
                cadence: String(ex.cadence || '2020'),
                restTime: Number(ex.restTime || ex.rest_time || 0),
                method: normalizeMethod(ex.method || 'Normal'),
                videoUrl: String(ex.videoUrl || ex.video_url || ''),
                notes: String(ex.notes || ''),
                setDetails: Array.isArray(ex?.setDetails) ? ex.setDetails : (Array.isArray(ex?.set_details) ? ex.set_details : [])
            }))
            const imported = { title, exercises: mapped }
            onChange?.(imported)
            if (await confirm('Importar e salvar este treino agora?', 'Salvar')) {
                const res = await onSave?.(imported)
                if (res && typeof res === 'object' && (res as Record<string, unknown>).ok === false) {
                    await alert(`Erro ao salvar: ${(res as Record<string, unknown>).error || 'Falha ao salvar treino'}`)
                }
            }
        } catch (err: unknown) {
            const msg = (err && typeof err === 'object' && 'message' in err) ? getErrorMessage(err) : String(err || '')
            await alert(`Falha ao importar JSON${msg ? `: ${msg}` : ''}`, 'Erro')
        } finally {
            if (e.target) e.target.value = ''
        }
    }, [workout, onChange, onSave, normalizeMethod, alert, confirm])

    const handleSave = useCallback(async () => {
        if (!workout.title || !workout.title.trim()) {
            await alert('Dê um nome ao treino!', 'Atenção'); return
        }
        setSaving(true)
        if (typeof showLoading === 'function') showLoading('Seu treino está sendo salvo. Aguarde...', 'Salvando')
        try {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { await alert('Usuário não logado. O treino não será salvo sem dono.', 'Erro'); return }
            if (onSave) {
                const res = await onSave({ ...workout, created_by: user.id, user_id: user.id })
                if (res && typeof res === 'object' && (res as Record<string, unknown>).ok === false) { await alert(`Erro ao salvar: ${(res as Record<string, unknown>).error || 'Falha ao salvar treino'}`); return }
                if (res && typeof res === 'object' && (res as Record<string, unknown>).deferred === true) {
                    await alert('Exercício adicionado ao treino ativo.\nAo finalizar o treino, você poderá escolher se deseja salvar essa mudança no modelo.', 'Exercício adicionado')
                    if (typeof onSaved === 'function') onSaved(); return
                }
                const sync = (res as Record<string, unknown>)?.sync as Record<string, unknown> | null || null
                if (sync) {
                    const created = Number(sync?.created || 0); const updated = Number(sync?.updated || 0); const failed = Number(sync?.failed || 0)
                    const extra = sync?.error ? `\n\nSincronização: falhou (${String(sync.error)})` : `\n\nSincronização: ${updated} atualizado(s), ${created} criado(s)${failed ? `, ${failed} falha(s)` : ''}`
                    await alert('Treino Salvo com Sucesso!' + extra, 'Sucesso')
                    if (typeof onSaved === 'function') onSaved(); return
                }
            } else {
                const exercisesPayload = (workout.exercises || []).map((ex, idx) => {
                    const setDetails = Array.isArray(ex?.setDetails) ? ex.setDetails : (Array.isArray(ex?.set_details) ? ex.set_details : null)
                    const headerSets = Number.parseInt(String(ex?.sets), 10) || 0
                    const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
                    const sets: unknown[] = []
                    for (let i = 0; i < numSets; i += 1) {
                        const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null
                        sets.push({ weight: s?.weight ?? null, reps: s?.reps ?? ex?.reps ?? null, rpe: s?.rpe ?? ex?.rpe ?? null, set_number: s?.set_number ?? (i + 1), completed: false, is_warmup: !!(s?.is_warmup ?? s?.isWarmup), advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null })
                    }
                    return { name: ex?.name || '', notes: ex?.notes || '', video_url: ex?.videoUrl || null, rest_time: ex?.restTime ?? null, cadence: ex?.cadence ?? null, method: ex?.method ?? null, order: idx, sets }
                })
                const { data: workoutId, error } = await supabase.rpc('save_workout_atomic', { p_workout_id: workout.id || null, p_user_id: user.id, p_created_by: user.id, p_is_template: true, p_name: normalizeWorkoutTitle(workout.title), p_notes: workout.notes, p_exercises: exercisesPayload })
                if (error) throw error
                if (!workoutId) throw new Error('Falha ao salvar treino')
            }
            await alert('Treino Salvo com Sucesso!', 'Sucesso')
            if (typeof onSaved === 'function') onSaved()
        } catch (e: unknown) {
            await alert('Erro ao salvar: ' + (getErrorMessage(e) || String(e || '')))
        } finally {
            if (typeof closeDialog === 'function') closeDialog()
            setSaving(false)
        }
    }, [workout, onSave, onSaved, saving, setSaving, alert, showLoading, closeDialog])

    return {
        getExerciseType,
        updateSetDetail,
        updateExercise,
        removeExercise,
        handleCancel,
        addExercise,
        toggleExerciseType,
        toggleBiSetWithNext,
        handleScannerFileChange,
        handleImportJson,
        handleSave,
    }
}
