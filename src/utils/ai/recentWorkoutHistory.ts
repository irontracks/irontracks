import type { SupabaseClient } from '@supabase/supabase-js'
import { setVolume, setTopWeightReps } from '@/utils/report/setVolume'
import { isSetCompleted } from '@/utils/report/setCompletion'

/**
 * Builds a compact, AI-friendly summary of the user's last few completed
 * workouts so coach-chat (and similar conversational endpoints) can answer
 * questions about volume, progression, recent loads, etc. without the user
 * having to paste numbers manually.
 *
 * Output is intentionally tight on tokens: per workout we only emit the
 * exercise name, the heaviest set (weight × reps), the total set count and
 * a rough volume in kg. That's enough for a coach to comment on
 * progression / fatigue without ballooning the prompt.
 *
 * Returns `null` when the user has no logged workouts — caller should pass
 * that through to the prompt as "histórico vazio" rather than fabricating.
 */

interface CompactExercise {
    name: string
    setsPlanned: number
    setsDone: number
    topSet: { weight: number; reps: number } | null
    volumeKg: number
}

interface CompactWorkout {
    date: string
    name: string
    durationMin: number | null
    exercises: CompactExercise[]
}

const safeJsonParse = (raw: string): unknown => {
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v)

const compactFromSession = (session: Record<string, unknown>, workoutName: string, workoutDate: string): CompactWorkout => {
    const exercises = Array.isArray(session.exercises) ? (session.exercises as unknown[]) : []
    const logs = isObj(session.logs) ? session.logs : {}
    const durationSec = Number(session.totalTime) || 0
    const durationMin = durationSec > 0 ? Math.round(durationSec / 60) : null

    const compactExercises: CompactExercise[] = exercises.map((ex, exIdx) => {
        const exObj = isObj(ex) ? ex : {}
        const name = String(exObj.name || `Exercício ${exIdx + 1}`).trim()
        const setsPlanned = parseInt(String(exObj.sets || 0), 10) || 0

        // Walk all logs that belong to this exercise. Preferred key format is
        // `${exIdx}-${setIdx}` (matches active-workout writes + report reads),
        // but if a future schema change uses a different prefix the loop just
        // returns 0 logged — caller still emits the exercise with setsPlanned
        // so the AI knows what was scheduled.
        let setsDone = 0
        let volumeKg = 0
        let topSet: { weight: number; reps: number } | null = null
        Object.entries(logs).forEach(([k, log]) => {
            if (!isObj(log)) return
            const parts = String(k).split('-')
            if (Number(parts[0]) !== exIdx) return
            const { weight: w, reps: r } = setTopWeightReps(log) // trata unilateral (L_/R_)
            const done = isSetCompleted(log)
            if (!done) return
            setsDone += 1
            const vol = setVolume(log)
            if (vol > 0) volumeKg += vol
            if (w > 0 && r > 0) {
                if (!topSet || w > topSet.weight || (w === topSet.weight && r > topSet.reps)) {
                    topSet = { weight: w, reps: r }
                }
            }
        })

        return {
            name,
            setsPlanned,
            setsDone,
            topSet,
            volumeKg: Math.round(volumeKg),
        }
    })
    // Don't filter exercises by `setsDone > 0` — keeping them lets the AI
    // distinguish "user planned bench but skipped it" from "user didn't have
    // bench in the workout at all". Same reasoning for keeping workouts with
    // 0 total logs below.

    return {
        date: workoutDate,
        name: workoutName,
        durationMin,
        exercises: compactExercises,
    }
}

/**
 * Fetch a compact summary of the user's last `limit` completed workouts.
 * Reads from the `workouts.notes` JSON column where the full session is
 * persisted (same as post-workout-insights).
 */
export async function fetchRecentWorkoutHistory(
    supabase: SupabaseClient,
    userId: string,
    limit = 5,
): Promise<CompactWorkout[] | null> {
    if (!userId) return null
    try {
        const { data: rows } = await supabase
            .from('workouts')
            .select('id, name, date, notes')
            .eq('user_id', userId)
            .eq('is_template', false)
            .order('date', { ascending: false })
            .limit(limit)

        if (!Array.isArray(rows) || rows.length === 0) return null

        const compact: CompactWorkout[] = []
        for (const row of rows as unknown[]) {
            const r: Record<string, unknown> = isObj(row) ? row : {}
            const notes = r.notes
            const session = (() => {
                if (!notes) return null
                if (typeof notes === 'object') return notes as Record<string, unknown>
                const parsed = safeJsonParse(String(notes))
                return isObj(parsed) ? parsed : null
            })()
            if (!session) continue
            const name = String(r.name || session.workoutTitle || 'Treino').trim() || 'Treino'
            const date = String(r.date || '').trim()
            const c = compactFromSession(session, name, date)
            // Push every workout, even when no logs were recorded — the AI can
            // still summarise scheduled volume and call out missing logs
            // explicitly instead of pretending it has no idea.
            compact.push(c)
        }

        return compact.length > 0 ? compact : null
    } catch {
        return null
    }
}
