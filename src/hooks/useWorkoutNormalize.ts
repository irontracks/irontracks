'use client'
import { logWarn } from '@/lib/logger'

import { useCallback } from 'react'
import { updateWorkout } from '@/actions/workout-actions'
import { formatProgramWorkoutTitle } from '@/utils/workoutTitle'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Treino ARQUIVADO fica de fora das ferramentas de manutenção.
 *
 * O usuário arquivou justamente para tirar da vista; alcançá-lo numa ação em
 * massa é mexer no que ele guardou. Na auditoria de 19/08/2026, "Normalizar
 * exercícios" renomeou 3 treinos arquivados sem dizer uma palavra.
 */
const apenasAtivos = (list: Array<Record<string, unknown>>) =>
    list.filter((w) => !(w?.archived_at ?? w?.archivedAt))

/**
 * Lista de mudanças para o diálogo: no máximo 8 linhas + "(+N)".
 *
 * Agrupa repetição em "×N": o mesmo exercício aparece em vários treinos, e no
 * aparelho o diálogo mostrava "Panturrilha sentado → Elevação de panturrilha
 * sentada" duas vezes seguidas. Linha repetida gasta o espaço que a próxima
 * troca precisava para ser lida.
 */
const preview = (linhas: string[], max = 8): string => {
    if (!linhas.length) return ''
    const contagem = new Map<string, number>()
    for (const l of linhas) contagem.set(l, (contagem.get(l) ?? 0) + 1)
    const unicas = [...contagem.entries()].map(([l, n]) => (n > 1 ? `${l} (×${n})` : l))
    const mostradas = unicas.slice(0, max).map((l) => `• ${l}`).join('\n')
    const resto = unicas.length > max ? `\n(+${unicas.length - max} outras)` : ''
    return `\n\n${mostradas}${resto}`
}

interface UseWorkoutNormalizeOptions {
    workouts: Array<Record<string, unknown>>
    programTitleStartDay?: string
    fetchWorkouts: () => Promise<void>
    alert: (msg: string, title?: string) => Promise<unknown>
    confirm: (msg: string, title?: string) => Promise<boolean>
}

interface UseWorkoutNormalizeReturn {
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

    const handleApplyTitleRule = useCallback(async () => {
        try {
            const list = apenasAtivos(Array.isArray(workouts) ? workouts : [])
            if (!list.length) {
                await alert('Nenhum treino ativo encontrado.')
                return
            }
            // Mostra o resultado ANTES de aplicar: renomear todos os treinos é
            // irreversível, e "em N treinos?" não deixa ninguém decidir nada.
            const mudancas = list
                .map((w, i) => {
                    const oldTitle = String(w?.title || '').trim()
                    const nextTitle = formatProgramWorkoutTitle(oldTitle || 'Treino', i, {
                        startDay: programTitleStartDay,
                    })
                    return nextTitle && nextTitle !== oldTitle ? `${oldTitle} → ${nextTitle}` : null
                })
                .filter((v): v is string => !!v)
            if (!mudancas.length) {
                await alert('Os títulos já estão no padrão.')
                return
            }
            if (
                !(await confirm(
                    `Renomear ${mudancas.length} treino(s)? Não dá para desfazer.${preview(mudancas)}`,
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
            } catch (e) { logWarn('useWorkoutNormalize', 'silenced error', e) }
            await alert(`Padronização concluída: ${updated} treinos atualizados.`)
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            await alert('Erro ao padronizar títulos: ' + message)
        }
    }, [alert, confirm, fetchWorkouts, programTitleStartDay, workouts])

    const handleNormalizeExercises = useCallback(async () => {
        try {
            const list = apenasAtivos(Array.isArray(workouts) ? workouts : [])
            const renames: string[] = []
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
                        renames.push(`${name} → ${info.canonical}`)
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
            // O nome do exercício é a CHAVE do histórico: renomear desliga a
            // ponte com as sessões antigas e o motor de carga volta a dizer "sem
            // histórico". Quem confirma precisa ver o "de → para" antes.
            if (
                !(await confirm(
                    `Renomear ${renames.length} exercício(s) em ${candidates.length} treino(s)?`
                    + ` O histórico de carga é ligado ao NOME — renomear pode zerar a sugestão de peso.`
                    + `${preview(renames)}`,
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
            } catch (e) { logWarn('useWorkoutNormalize', 'silenced error', e) }
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
        handleApplyTitleRule,
        handleNormalizeExercises,
    }
}
