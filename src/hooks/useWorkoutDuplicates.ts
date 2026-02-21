import { useState, useCallback } from 'react'
import { DuplicateGroup } from '@/types/app'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { setWorkoutArchived } from '@/actions/workout-actions'
import { updateWorkout } from '@/actions/workout-actions'
import { getErrorMessage } from '@/utils/errorMessage'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

export type UseWorkoutDuplicatesOptions = {
    workouts: Array<Record<string, unknown>>
    fetchWorkouts: () => Promise<void>
    alert: (msg: string, title?: string) => Promise<void>
    confirm: (msg: string, title?: string) => Promise<boolean>
}

export type UseWorkoutDuplicatesReturn = {
    duplicatesOpen: boolean
    setDuplicatesOpen: React.Dispatch<React.SetStateAction<boolean>>
    duplicateGroups: DuplicateGroup[]
    setDuplicateGroups: React.Dispatch<React.SetStateAction<DuplicateGroup[]>>
    duplicatesBusy: boolean
    handleOpenDuplicates: () => Promise<void>
    handleArchiveDuplicateGroup: (group: unknown) => Promise<void>
    handleMergeDuplicateGroup: (group: unknown) => Promise<void>
}

export function useWorkoutDuplicates({
    workouts,
    fetchWorkouts,
    alert,
    confirm,
}: UseWorkoutDuplicatesOptions): UseWorkoutDuplicatesReturn {
    const [duplicatesOpen, setDuplicatesOpen] = useState(false)
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
    const [duplicatesBusy, setDuplicatesBusy] = useState(false)

    const handleOpenDuplicates = useCallback(async () => {
        const list = (Array.isArray(workouts) ? workouts : []).filter((w) => !w?.archived_at)
        const keys = list.map((w) => {
            const exercises = Array.isArray(w?.exercises) ? w.exercises : []
            const set = new Set<string>()
            for (const ex of exercises) {
                const name = String((ex as Record<string, unknown>)?.name || '').trim()
                if (!name) continue
                const info = resolveCanonicalExerciseName(name)
                const base = String(info?.canonical || name).trim()
                const k = normalizeExerciseName(base)
                if (k) set.add(k)
            }
            return set
        })

        const parent: number[] = Array.from({ length: list.length }).map((_, i) => i)
        const find = (x: number): number => {
            let r = x
            while (parent[r] !== r) r = parent[r]
            let cur = x
            while (parent[cur] !== cur) {
                const p = parent[cur]
                parent[cur] = r
                cur = p
            }
            return r
        }
        const unite = (a: number, b: number) => {
            const ra = find(a)
            const rb = find(b)
            if (ra !== rb) parent[rb] = ra
        }

        const similarity = (a: number, b: number): number => {
            const A = keys[a]
            const B = keys[b]
            if (!A?.size || !B?.size) return 0
            let inter = 0
            for (const v of A) if (B.has(v)) inter += 1
            const union = A.size + B.size - inter
            if (!union) return 0
            return inter / union
        }

        const edges: Array<{ i: number; j: number; score: number }> = []
        for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 1; j < list.length; j += 1) {
                const score = similarity(i, j)
                if (score >= 0.9) {
                    unite(i, j)
                    edges.push({ i, j, score })
                }
            }
        }

        const groupsMap = new Map<number, number[]>()
        for (let i = 0; i < list.length; i += 1) {
            const r = find(i)
            const arr = groupsMap.get(r) || []
            arr.push(i)
            groupsMap.set(r, arr)
        }

        const groups: DuplicateGroup[] = []
        for (const idxs of groupsMap.values()) {
            if (!idxs || idxs.length < 2) continue
            let best = 0
            for (const e of edges) {
                if (idxs.includes(e.i) && idxs.includes(e.j)) best = Math.max(best, e.score)
            }
            groups.push({ items: idxs.map((i: number) => list[i] as Record<string, unknown>), score: best || 0.9 })
        }

        if (!groups.length) {
            await alert('Não encontrei duplicados com alta similaridade.')
            return
        }
        groups.sort((a, b) => b.score - a.score)
        setDuplicateGroups(groups)
        setDuplicatesOpen(true)
    }, [workouts, alert])

    const handleArchiveDuplicateGroup = useCallback(
        async (group: unknown) => {
            if (duplicatesBusy) return
            try {
                const g = isRecord(group) ? group : ({} as Record<string, unknown>)
                const items = Array.isArray(g?.items) ? (g.items as unknown[]) : []
                if (items.length < 2) return
                const base = isRecord(items[0]) ? items[0] : null
                const others = items.slice(1)
                if (!(await confirm(`Arquivar ${others.length} duplicados e manter "${base?.title || 'Treino'}"?`, 'Arquivar duplicados'))) return
                setDuplicatesBusy(true)
                for (const w of others) {
                    const wo = isRecord(w) ? w : ({} as Record<string, unknown>)
                    const id = String(wo?.id || '').trim()
                    if (!id) continue
                    const res = await setWorkoutArchived(id, true)
                    if (!res?.ok) throw new Error(String(res?.error || 'Falha ao arquivar'))
                }
                await fetchWorkouts()
                setDuplicatesOpen(false)
                setDuplicateGroups([])
            } catch (e) {
                await alert('Erro ao arquivar duplicados: ' + getErrorMessage(e))
            } finally {
                setDuplicatesBusy(false)
            }
        },
        [duplicatesBusy, fetchWorkouts, alert, confirm]
    )

    const handleMergeDuplicateGroup = useCallback(
        async (group: unknown) => {
            if (duplicatesBusy) return
            try {
                const g = isRecord(group) ? group : ({} as Record<string, unknown>)
                const items = Array.isArray(g?.items) ? (g.items as unknown[]) : []
                if (items.length < 2) return
                const base = isRecord(items[0]) ? items[0] : null
                const others = items.slice(1)
                if (!(await confirm(`Mesclar ${others.length} duplicados em "${base?.title || 'Treino'}" e arquivar os demais?`, 'Mesclar duplicados'))) return
                setDuplicatesBusy(true)

                const baseExercises: Array<Record<string, unknown>> = Array.isArray(base?.exercises)
                    ? (base.exercises as unknown[]).filter(isRecord)
                    : []
                const seen = new Set<string>()
                const merged: Array<Record<string, unknown>> = []
                for (const ex of baseExercises) {
                    const name = String(ex?.name || '').trim()
                    const method = String(ex?.method || '').trim()
                    const reps = String(ex?.reps || '').trim()
                    const k = `${normalizeExerciseName(resolveCanonicalExerciseName(name).canonical || name)}|${method}|${reps}`
                    if (k && !seen.has(k)) {
                        seen.add(k)
                        merged.push(ex)
                    }
                }
                for (const w of others) {
                    const wo = isRecord(w) ? w : ({} as Record<string, unknown>)
                    const exs = Array.isArray(wo?.exercises) ? (wo.exercises as unknown[]) : []
                    for (const ex of exs) {
                        const exObj = isRecord(ex) ? ex : ({} as Record<string, unknown>)
                        const name = String(exObj?.name || '').trim()
                        const method = String(exObj?.method || '').trim()
                        const reps = String(exObj?.reps || '').trim()
                        const k = `${normalizeExerciseName(resolveCanonicalExerciseName(name).canonical || name)}|${method}|${reps}`
                        if (!k || seen.has(k)) continue
                        seen.add(k)
                        merged.push(exObj)
                    }
                }

                const baseId = String(base?.id || '').trim()
                if (!baseId) throw new Error('Treino base sem ID')
                const res = await updateWorkout(baseId, {
                    title: String(base?.title || 'Treino'),
                    notes: base?.notes ?? '',
                    exercises: merged,
                })
                if (!res?.ok) throw new Error(String(res?.error || 'Falha ao salvar treino mesclado'))

                for (const w of others) {
                    const wo = isRecord(w) ? w : ({} as Record<string, unknown>)
                    const id = String(wo?.id || '').trim()
                    if (!id) continue
                    const a = await setWorkoutArchived(id, true)
                    if (!a?.ok) throw new Error(String(a?.error || 'Falha ao arquivar'))
                }
                await fetchWorkouts()
                setDuplicatesOpen(false)
                setDuplicateGroups([])
            } catch (e) {
                await alert('Erro ao mesclar duplicados: ' + getErrorMessage(e))
            } finally {
                setDuplicatesBusy(false)
            }
        },
        [duplicatesBusy, fetchWorkouts, alert, confirm]
    )

    return {
        duplicatesOpen,
        setDuplicatesOpen,
        duplicateGroups,
        setDuplicateGroups,
        duplicatesBusy,
        handleOpenDuplicates,
        handleArchiveDuplicateGroup,
        handleMergeDuplicateGroup,
    }
}
