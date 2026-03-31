/**
 * GET /api/analysis/muscle-balance
 *
 * Analyzes workout sessions from the last 28 days and returns
 * volume per muscle group + antagonist imbalances.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { buildHeuristicExerciseMap } from '@/utils/exerciseMuscleHeuristics'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import type { MuscleId } from '@/utils/muscleMapConfig'

export const dynamic = 'force-dynamic'

const ANTAGONIST_PAIRS = [
  { a: 'chest', b: 'lats', labelA: 'Peitoral', labelB: 'Dorsais' },
  { a: 'chest', b: 'upper_back', labelA: 'Peitoral', labelB: 'Costas sup.' },
  { a: 'biceps', b: 'triceps', labelA: 'Bíceps', labelB: 'Tríceps' },
  { a: 'quads', b: 'hamstrings', labelA: 'Quadríceps', labelB: 'Posteriores' },
  { a: 'delts_front', b: 'delts_rear', labelA: 'Deltoide frontal', labelB: 'Deltoide posterior' },
] as const

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()

  // Get workout sessions from last 28 days
  const { data: sessions } = await admin
    .from('workout_sessions')
    .select('notes, started_at')
    .eq('user_id', auth.user.id)
    .gte('started_at', since)
    .limit(60)

  const setsPerMuscle = new Map<MuscleId, number>()
  const sessionDates: string[] = []

  for (const session of Array.isArray(sessions) ? sessions : []) {
    try {
      const notes = typeof session.notes === 'string' ? JSON.parse(session.notes) : session.notes
      if (!notes || typeof notes !== 'object') continue
      const exercises = Array.isArray(notes.exercises) ? notes.exercises : []
      const logs = notes.logs && typeof notes.logs === 'object' ? notes.logs as Record<string, unknown> : {}

      sessionDates.push(String(session.started_at || '').slice(0, 10))

      exercises.forEach((ex: unknown, exIdx: number) => {
        const exObj = ex && typeof ex === 'object' ? ex as Record<string, unknown> : {}
        const name = String(exObj?.name || '').trim()
        if (!name) return

        // Count completed sets
        const setsCount = Number(exObj?.sets) || 0
        let doneSets = 0
        for (let s = 0; s < setsCount; s++) {
          const log = logs[`${exIdx}-${s}`]
          if (log && typeof log === 'object' && (log as Record<string, unknown>).done) doneSets++
        }
        if (doneSets === 0) return

        // Map exercise to muscle groups
        const normalized = normalizeExerciseName(name)
        const heuristic = buildHeuristicExerciseMap(normalized)
        if (!heuristic) return

        for (const c of heuristic.mapping.contributions) {
          if (c.role === 'primary') {
            setsPerMuscle.set(c.muscleId, (setsPerMuscle.get(c.muscleId) || 0) + doneSets)
          } else if (c.role === 'secondary') {
            setsPerMuscle.set(c.muscleId, (setsPerMuscle.get(c.muscleId) || 0) + doneSets * 0.5)
          }
        }
      })
    } catch { /* skip bad session */ }
  }

  // Compute antagonist ratios
  const imbalances = ANTAGONIST_PAIRS.map(pair => {
    const setsA = setsPerMuscle.get(pair.a as MuscleId) || 0
    const setsB = setsPerMuscle.get(pair.b as MuscleId) || 0
    const total = setsA + setsB
    const ratio = total > 0 ? setsA / total : 0.5
    const deviation = Math.abs(ratio - 0.5)
    return {
      muscleA: pair.a,
      muscleB: pair.b,
      labelA: pair.labelA,
      labelB: pair.labelB,
      setsA: Math.round(setsA),
      setsB: Math.round(setsB),
      ratio: Math.round(ratio * 100),
      deviation: Math.round(deviation * 100),
      balanced: deviation < 0.15, // within 15% is considered balanced
    }
  })

  // Top muscles by volume
  const muscleVolume = Array.from(setsPerMuscle.entries())
    .map(([id, sets]) => ({ id, sets: Math.round(sets) }))
    .sort((a, b) => b.sets - a.sets)

  const totalSessions = new Set(sessionDates).size

  return NextResponse.json({
    ok: true,
    totalSessions,
    muscleVolume,
    imbalances,
    periodDays: 28,
  })
}
