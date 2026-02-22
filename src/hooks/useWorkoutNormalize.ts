'use client'

import { useCallback } from 'react'
import { updateWorkout } from '@/actions/workout-actions'
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

interface UseWorkoutNormalizeOptions {
    workouts: Array<Record<string, unknown>>
    programTitleStartDay?: number
    fetchWorkouts: () => Promise<void>
    alert: (msg: string, title?: string) => Promise<unknown>
    confirm: (msg: string, title?: string) => Promise<boolean>
}

interface UseWorkoutNormalizeReturn {
    handleNormalizeAiWorkoutTitles: () => Promise<void>
    handleApplyTitleRule: () => Promise<void>
    handleNormalizeExercises: () => Promise<void>
}

export function useWorkoutNormalize({
    workouts,
    programTitleStartDay,
    fetchWorkouts,
    alert,
    confirm,
}: UseWorkoutNormalizeOptions): UseWorkoutNormalizeReturn {

    const handleNormalizeAiWorkoutTitles = useCallback(async () => {
        try {
            const list = Array.isArray(workouts) ? workouts : []
            const candidates = list
                .map((w) => {
                    const title = String(w?.title || '').trim()
                    const m = title.match(/\(\s*dia\s*(\d+)\s*\)/i)
                    if (!m?.[1]) return null
                    const day = Number(m[1])
                    if (!Number.isFinite(day) || day <= 0) return null
                    return { workout: w, dayIndex: Math.floor(day - 1) }
                })
                .filter(Boolean)

            if (!candidates.length) {
                await alert('Nenhum treino no formato antigo "(Dia X)" foi encontrado.')
                return
            }
            if (
                !(await confirm(
                    `Padronizar nomes de ${candidates.length} treinos gerados automaticamente?`,
                    'Padronizar nomes'
                ))
            )
                return

            let changed = 0
            for (const item of candidates) {
                if (!item) continue
                const w = item.workout
                const idx = item.dayIndex
                const id = String(w?.id || '').trim()
                if (!id) continue
                const oldTitle = String(w?.title || '').trim()
                const nextTitle = formatProgramWorkoutTitle(oldTitle, idx, {
                    startDay: programTitleStartDay,
                })
                if (!nextTitle || nextTitle === oldTitle) continue
                const res = await updateWorkout(id, {
                    title: nextTitle,
                    notes: w?.notes ?? '',
                    exercises: Array.isArray(w?.exercises) ? w.exercises : [],
                })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao renomear treino'))
                changed += 1
            }
            try {
                await fetchWorkouts()
            } catch { }
            await alert(`Padronização concluída: ${changed} treinos atualizados.`)
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao padronizar nomes: ' + message)
        }
    }, [alert, confirm, fetchWorkouts, programTitleStartDay, workouts])

    const handleApplyTitleRule = useCallback(async () => {
        try {
            const list = Array.isArray(workouts) ? workouts : []
            if (!list.length) {
                await alert('Nenhum treino encontrado.')
                return
            }
            if (
                !(await confirm(
                    `Padronizar títulos de ${list.length} treinos com A/B/C... e dia da semana?`,
                    'Padronizar títulos'
                ))
            )
                return
            let updated = 0
            for (let i = 0; i < list.length; i += 1) {
                const w = list[i]
                const id = String(w?.id || '').trim()
                if (!id) continue
                const oldTitle = String(w?.title || '').trim()
                const nextTitle = formatProgramWorkoutTitle(oldTitle || 'Treino', i, {
                    startDay: programTitleStartDay,
                })
                if (!nextTitle || nextTitle === oldTitle) continue
                const res = await updateWorkout(id, {
                    title: nextTitle,
                    notes: w?.notes ?? '',
                    exercises: Array.isArray(w?.exercises) ? w.exercises : [],
                })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao renomear treino'))
                updated += 1
            }
            try {
                await fetchWorkouts()
            } catch { }
            await alert(`Padronização concluída: ${updated} treinos atualizados.`)
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao padronizar títulos: ' + message)
        }
    }, [alert, confirm, fetchWorkouts, programTitleStartDay, workouts])

    const handleNormalizeExercises = useCallback(async () => {
        try {
            const list = Array.isArray(workouts) ? workouts : []
            const candidates = list
                .map((w) => {
                    const exercises: Array<Record<string, unknown>> = Array.isArray(w?.exercises)
                        ? (w.exercises as unknown[]).filter(isRecord)
                        : []
                    let changesCount = 0
                    const nextExercises = exercises.map((ex: Record<string, unknown>) => {
                        const name = String(ex?.name ?? '').trim()
                        if (!name) return ex
                        const info = resolveCanonicalExerciseName(name)
                        if (!info?.changed || !info?.canonical) return ex
                        changesCount += 1
                        return { ...ex, name: info.canonical }
                    })
                    if (!changesCount) return null
                    return { workout: w, nextExercises, changesCount }
                })
                .filter(Boolean)

            if (!candidates.length) {
                await alert('Nenhum exercício para normalizar foi encontrado.')
                return
            }
            if (
                !(await confirm(
                    `Normalizar exercícios em ${candidates.length} treinos?`,
                    'Normalizar exercícios'
                ))
            )
                return

            let updated = 0
            const updatedWorkouts: Array<{ title: string; changesCount: number }> = []
            for (const item of candidates) {
                if (!item) continue
                const w = item.workout
                const id = String(w?.id || '').trim()
                if (!id) continue
                const title =
                    String(w?.title || '').trim() || `Treino ${id.slice(0, 8)}`
                const notes = w?.notes ?? ''
                const res = await updateWorkout(id, {
                    title,
                    notes,
                    exercises: item.nextExercises,
                })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao atualizar treino'))
                updated += 1
                updatedWorkouts.push({ title, changesCount: Number(item?.changesCount || 0) })
            }
            try {
                await fetchWorkouts()
            } catch { }
            const lines = updatedWorkouts
                .slice(0, 10)
                .map(
                    (it) =>
                        `• ${it.title}${it.changesCount ? ` (${it.changesCount} exercício(s))` : ''}`
                )
                .join('\n')
            const more =
                updatedWorkouts.length > 10
                    ? `\n(+${updatedWorkouts.length - 10} outros)`
                    : ''
            const detail = lines ? `\n\nTreinos atualizados:\n${lines}${more}` : ''
            await alert(
                `Normalização concluída: ${updated} treinos atualizados.${detail}`
            )
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao normalizar exercícios: ' + message)
        }
    }, [alert, confirm, fetchWorkouts, workouts])

    return {
        handleNormalizeAiWorkoutTitles,
        handleApplyTitleRule,
        handleNormalizeExercises,
    }
}
