/**
 * POST /api/workouts/log-set-from-watch
 *
 * Receives a WatchSetLog from the iPhone WatchBridge and merges it into the
 * user's current active_workout_sessions state.
 *
 * Log format mirrors the web app: logs[`${exIdx}-${setIdx}`] = { done, reps, weight, rpe }
 * The Watch sends exerciseId + setNumber; we resolve exIdx by matching exercise.id
 * (or exercise._itx_exKey) in the session state.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logWarn } from '@/lib/logger'

const WatchSetLogSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0),
  weightKg: z.number().nullable().optional(),
  rpe: z.number().nullable().optional(),
  completedAt: z.string(),
}).strip()

type SessionState = Record<string, unknown>

function safeRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`watch:log-set:${user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(request, WatchSetLogSchema)
    if (parsedBody.response) return parsedBody.response
    const setLog = parsedBody.data!

    // Fetch active session
    const { data: sessionRow, error: sessionError } = await supabase
      .from('active_workout_sessions')
      .select('state, started_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (sessionError) return NextResponse.json({ ok: false, error: sessionError.message }, { status: 400 })
    if (!sessionRow) return NextResponse.json({ ok: false, error: 'no_active_session' }, { status: 404 })

    // Parse state
    let state: SessionState
    try {
      state = typeof sessionRow.state === 'string'
        ? (JSON.parse(sessionRow.state) as SessionState)
        : safeRecord(sessionRow.state)
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_session_state' }, { status: 400 })
    }

    // Find exercise index
    const workout = safeRecord(state.workout)
    const exercises: unknown[] = Array.isArray(workout.exercises) ? workout.exercises : []

    const exIdx = exercises.findIndex((ex) => {
      const e = safeRecord(ex)
      return (
        String(e.id ?? '') === setLog.exerciseId ||
        String(e._itx_exKey ?? '') === setLog.exerciseId
      )
    })

    if (exIdx === -1) {
      logWarn('watch:log-set', `exerciseId ${setLog.exerciseId} not found in active session`)
      return NextResponse.json({ ok: false, error: 'exercise_not_found' }, { status: 404 })
    }

    const setIdx = setLog.setNumber - 1   // convert 1-based → 0-based
    const logKey = `${exIdx}-${setIdx}`

    // Merge into existing logs (same pattern as handleUpdateSessionLog)
    const existingLogs = safeRecord(state.logs)
    const existingEntry = safeRecord(existingLogs[logKey])
    const updatedEntry = {
      ...existingEntry,
      done: true,
      reps: setLog.reps,
      weight: setLog.weightKg ?? existingEntry.weight ?? null,
      rpe: setLog.rpe ?? existingEntry.rpe ?? null,
      source: 'apple-watch',
    }
    const updatedState: SessionState = {
      ...state,
      logs: { ...existingLogs, [logKey]: updatedEntry },
    }

    // Upsert back
    const { error: upsertError } = await supabase
      .from('active_workout_sessions')
      .upsert(
        {
          user_id: user.id,
          started_at: sessionRow.started_at,
          state: updatedState,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) return NextResponse.json({ ok: false, error: upsertError.message }, { status: 400 })

    return NextResponse.json({ ok: true, logKey, exerciseIndex: exIdx, setIndex: setIdx })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
