import { logError } from '@/lib/logger'

/**
 * Maps a raw Supabase workout row (with nested exercises/sets) into the
 * normalized shape used by the IronTracks app.
 */
export const mapWorkoutRow = (w: unknown): Record<string, unknown> => {
    const workout =
        w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
    const rawExercises = Array.isArray(workout?.exercises)
        ? (workout.exercises as unknown[])
        : []
    const exs = rawExercises
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
        .sort(
            (a: Record<string, unknown>, b: Record<string, unknown>) =>
                (Number(a.order) || 0) - (Number(b.order) || 0)
        )
        .map((e: Record<string, unknown>) => {
            try {
                const isCardio = String(e.method || '').toLowerCase() === 'cardio'
                const dbSets = Array.isArray(e.sets)
                    ? (e.sets as unknown[]).filter(
                        (s): s is Record<string, unknown> => Boolean(s && typeof s === 'object')
                    )
                    : []

                const sortedSets = dbSets
                    .slice()
                    .sort(
                        (aSet: Record<string, unknown>, bSet: Record<string, unknown>) =>
                            (Number(aSet?.set_number) || 0) - (Number(bSet?.set_number) || 0)
                    )

                const setsCount = sortedSets.length || (isCardio ? 1 : 4)

                const setDetails = sortedSets.map(
                    (s: Record<string, unknown>, idx: number) => ({
                        set_number: s?.set_number ?? idx + 1,
                        reps: s?.reps ?? null,
                        rpe: s?.rpe ?? null,
                        weight: s?.weight ?? null,
                        is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
                        advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
                    })
                )

                const nonEmptyReps = setDetails
                    .map((s: { reps: unknown }) => s.reps)
                    .filter((r: unknown) => r !== null && r !== undefined && r !== '')
                const defaultReps = isCardio ? '20' : '10'
                let repsHeader = defaultReps
                if (nonEmptyReps.length > 0) {
                    const uniqueReps = Array.from(new Set(nonEmptyReps))
                    repsHeader =
                        uniqueReps.length === 1
                            ? String(uniqueReps[0] ?? defaultReps)
                            : String(nonEmptyReps[0] ?? defaultReps)
                }

                const rpeValues = setDetails
                    .map((s: { rpe: unknown }) => s.rpe)
                    .filter(
                        (v: unknown) => v !== null && v !== undefined && !Number.isNaN(Number(v))
                    )
                const defaultRpe = isCardio ? 5 : 8
                const rpeHeader =
                    rpeValues.length > 0 ? Number(rpeValues[0]) || defaultRpe : defaultRpe

                return {
                    id: e.id,
                    name: e.name,
                    notes: e.notes,
                    videoUrl: e.video_url,
                    restTime: e.rest_time,
                    cadence: e.cadence,
                    method: e.method,
                    sets: setsCount,
                    reps: repsHeader,
                    rpe: rpeHeader,
                    setDetails,
                }
            } catch (mapErr) {
                logError('Erro ao mapear exercício', {
                    workoutId: workout?.id,
                    exerciseId: e?.id,
                    error: mapErr,
                })
                return null
            }
        })
        .filter(Boolean)

    return {
        id: workout.id != null ? String(workout.id) : undefined,
        title: String(workout.name ?? ''),
        notes: workout.notes,
        exercises: exs,
        is_template: !!workout.is_template,
        userId: workout.user_id != null ? String(workout.user_id) : undefined,
        createdBy: workout.created_by != null ? String(workout.created_by) : undefined,
        archivedAt: workout.archived_at ?? null,
        sortOrder:
            typeof workout.sort_order === 'number'
                ? workout.sort_order
                : workout.sort_order == null
                    ? 0
                    : Number(workout.sort_order) || 0,
        createdAt: workout.created_at ?? null,
    }
}
