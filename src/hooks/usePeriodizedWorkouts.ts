'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { z } from 'zod'
import { WorkoutRowSchema, ExerciseRowSchema, SetRowSchema } from '@/schemas/database'
import { AdvancedConfig } from '@/types/app'
import { getErrorMessage } from '@/utils/errorMessage'
import type { DashboardWorkout, DashboardExercise, DashboardSetDetail } from '@/types/dashboard'

// ────────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────────

const PeriodizationActiveWorkoutSchema = z.object({
  workout_id: z.string(),
  exercise_count: z.number().nullable().optional(),
})

const PeriodizationActiveResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    error: z.unknown().optional(),
    workouts: z.array(PeriodizationActiveWorkoutSchema).optional(),
    program: z.object({ id: z.unknown().optional() }).optional(),
  })
  .passthrough()

const WorkoutListRowSchema = z
  .object({
    id: WorkoutRowSchema.shape.id,
    user_id: WorkoutRowSchema.shape.user_id,
    created_by: z.string().uuid().nullable().optional(),
    name: WorkoutRowSchema.shape.name,
    notes: WorkoutRowSchema.shape.notes,
    archived_at: z.string().nullable().optional(),
    sort_order: z.number().nullable().optional(),
    created_at: z.string().nullable().optional(),
  })
  .passthrough()

const WorkoutSetRowSchema = z
  .object({
    id: SetRowSchema.shape.id,
    set_number: SetRowSchema.shape.set_number,
    weight: SetRowSchema.shape.weight,
    reps: SetRowSchema.shape.reps,
    rpe: SetRowSchema.shape.rpe,
    completed: SetRowSchema.shape.completed,
    is_warmup: SetRowSchema.shape.is_warmup,
    advanced_config: SetRowSchema.shape.advanced_config,
  })
  .passthrough()

const WorkoutExerciseRowSchema = z
  .object({
    id: ExerciseRowSchema.shape.id,
    name: ExerciseRowSchema.shape.name,
    notes: ExerciseRowSchema.shape.notes,
    video_url: ExerciseRowSchema.shape.video_url,
    rest_time: ExerciseRowSchema.shape.rest_time,
    cadence: ExerciseRowSchema.shape.cadence,
    method: ExerciseRowSchema.shape.method,
    order: ExerciseRowSchema.shape.order,
    sets: z.array(WorkoutSetRowSchema).optional(),
  })
  .passthrough()

const WorkoutFullRowSchema = z
  .object({
    id: WorkoutRowSchema.shape.id,
    user_id: WorkoutRowSchema.shape.user_id,
    created_by: z.string().uuid().nullable().optional(),
    name: WorkoutRowSchema.shape.name,
    notes: WorkoutRowSchema.shape.notes,
    archived_at: z.string().nullable().optional(),
    sort_order: z.number().nullable().optional(),
    created_at: z.string().nullable().optional(),
    exercises: z.array(WorkoutExerciseRowSchema).optional(),
  })
  .passthrough()

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

const toIntOrZero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export const isPeriodizedWorkout = (w: DashboardWorkout) =>
  String(w?.title || w?.name || '').trim().startsWith('VIP •')

export function isPeriodizedWorkoutFullyLoaded(w: DashboardWorkout) {
  const exs = Array.isArray(w?.exercises) ? w.exercises : []
  if (exs.length === 0) return false
  return exs.some((e) => Array.isArray(e?.setDetails))
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

interface UsePeriodizedWorkoutsOpts {
  view: string
  workoutsTab: 'normal' | 'periodized'
}

export function usePeriodizedWorkouts({ view, workoutsTab }: UsePeriodizedWorkoutsOpts) {
  const supabase = useMemo(() => createClient(), [])
  const [periodizedLoading, setPeriodizedLoading] = useState(false)
  const [periodizedLoaded, setPeriodizedLoaded] = useState(false)
  const [periodizedWorkouts, setPeriodizedWorkouts] = useState<DashboardWorkout[]>([])
  const [periodizedError, setPeriodizedError] = useState('')

  // Reset when dashboard view or tab changes
  useEffect(() => {
    if (view !== 'dashboard') return
    if (workoutsTab !== 'periodized') return
    setPeriodizedLoaded(false)
    setPeriodizedWorkouts([])
    setPeriodizedError('')
  }, [view, workoutsTab])

  // Fetch periodized workouts from API + Supabase
  useEffect(() => {
    if (workoutsTab !== 'periodized') return
    if (periodizedLoaded) return
    if (periodizedLoading) return
    let cancelled = false
    setPeriodizedLoading(true)
    setPeriodizedError('')
    ;(async () => {
      try {
        const res = await fetch('/api/vip/periodization/active', { method: 'GET', credentials: 'include', cache: 'no-store' })
        const jsonUnknown: unknown = await res.json().catch(() => null)
        const jsonParsed = PeriodizationActiveResponseSchema.safeParse(jsonUnknown)
        const json = jsonParsed.success ? jsonParsed.data : null
        if (cancelled) return
        if (!json?.ok) {
          const msg = json?.error != null ? String(json.error) : 'Falha ao carregar periodização.'
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError(msg)
          return
        }
        const rows = Array.isArray(json?.workouts) ? json.workouts : []
        const ids = rows.map((r) => String(r?.workout_id || '').trim()).filter(Boolean)
        const countById = new Map<string, number>()
        rows.forEach((r) => {
          const id = String(r?.workout_id || '').trim()
          const n = Number(r?.exercise_count)
          if (!id) return
          if (!Number.isFinite(n)) return
          countById.set(id, Math.max(0, Math.floor(n)))
        })
        if (ids.length === 0) {
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError(json?.program?.id ? 'Programa encontrado, mas sem treinos vinculados.' : '')
          return
        }

        const { data, error } = await supabase
          .from('workouts')
          .select(`id, user_id, created_by, name, notes, archived_at, sort_order, created_at`)
          .in('id', ids)
          .limit(ids.length)

        if (cancelled) return
        if (error) {
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError(String(getErrorMessage(error) || 'Falha ao carregar treinos periodizados.'))
          return
        }

        const mapped = (Array.isArray(data) ? data : [])
          .filter((w) => isRecord(w))
          .map((w): DashboardWorkout | null => {
            const parsed = WorkoutListRowSchema.safeParse(w)
            if (!parsed.success) return null
            const workout = parsed.data
            const wid = String(workout.id || '').trim()
            return {
              id: workout.id ?? undefined,
              title: String(workout.name ?? ''),
              notes: workout.notes,
              exercises: [],
              exercises_count: wid ? (countById.get(wid) ?? null) : null,
              user_id: workout.user_id,
              created_by: workout.created_by ?? null,
              archived_at: workout.archived_at ?? null,
              sort_order: workout.sort_order == null ? 0 : toIntOrZero(workout.sort_order),
              created_at: workout.created_at ?? null,
            } satisfies DashboardWorkout
          })
          .filter((w): w is DashboardWorkout => Boolean(w))

        const byId = new Map<string, DashboardWorkout>()
        mapped.forEach((w: DashboardWorkout) => {
          const id = String(w?.id || '').trim()
          if (id) byId.set(id, w)
        })
        const ordered = ids.map((id: string) => byId.get(id)).filter(Boolean) as DashboardWorkout[]
        setPeriodizedWorkouts(ordered)
        setPeriodizedLoaded(true)
      } catch {
        if (!cancelled) {
          setPeriodizedWorkouts([])
          setPeriodizedLoaded(true)
          setPeriodizedError('Falha ao carregar treinos periodizados.')
        }
      } finally {
        if (!cancelled) setPeriodizedLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [periodizedLoaded, periodizedLoading, supabase, workoutsTab])

  // Load full workout by ID (for lazy-load on click)
  const loadWorkoutFullById = async (workoutId: string): Promise<DashboardWorkout | null> => {
    const id = String(workoutId || '').trim()
    if (!id) return null
    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id, user_id, created_by, name, notes, archived_at, sort_order, created_at,
        exercises (
          id, name, notes, video_url, rest_time, cadence, method, "order",
          sets ( id, set_number, weight, reps, rpe, completed, is_warmup, advanced_config )
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error || !data?.id) return null

    const parsed = WorkoutFullRowSchema.safeParse(data)
    if (!parsed.success) return null

    const workout = parsed.data
    const rawExercises = Array.isArray(workout?.exercises) ? workout.exercises : []
    const exs: DashboardExercise[] = rawExercises
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e) => {
        const isCardio = String(e.method || '').toLowerCase() === 'cardio'
        const dbSets = Array.isArray(e.sets) ? e.sets : []
        const sortedSets = dbSets.slice().sort((aSet, bSet) => (aSet.set_number ?? 0) - (bSet.set_number ?? 0))
        const setsCount = sortedSets.length || (isCardio ? 1 : 4)
        const setDetails: DashboardSetDetail[] = sortedSets.map((s) => ({
          set_number: s.set_number,
          reps: s.reps,
          rpe: s.rpe,
          weight: s.weight,
          isWarmup: !!s.is_warmup,
          advancedConfig: (s.advanced_config as AdvancedConfig | AdvancedConfig[] | null) ?? null,
        }))
        const nonEmptyReps = setDetails.map((s) => s.reps).filter((r): r is string => typeof r === 'string' && r.trim() !== '')
        const defaultReps = isCardio ? '20' : '10'
        let repsHeader = defaultReps
        if (nonEmptyReps.length > 0) {
          const uniqueReps = Array.from(new Set(nonEmptyReps))
          repsHeader = uniqueReps.length === 1 ? String(uniqueReps[0] ?? defaultReps) : String(nonEmptyReps[0] ?? defaultReps)
        }
        const rpeValues = setDetails.map((s) => s.rpe).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        const defaultRpe = isCardio ? 5 : 8
        const rpeHeader = rpeValues.length > 0 ? (Number(rpeValues[0]) || defaultRpe) : defaultRpe
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
        } satisfies DashboardExercise
      })

    return {
      id: workout.id,
      title: String(workout.name ?? ''),
      notes: workout.notes,
      exercises: exs,
      user_id: workout.user_id,
      created_by: workout.created_by ?? null,
      archived_at: workout.archived_at ?? null,
      sort_order: workout.sort_order == null ? 0 : toIntOrZero(workout.sort_order),
      created_at: workout.created_at ?? null,
    } satisfies DashboardWorkout
  }

  return {
    periodizedLoading,
    periodizedLoaded,
    periodizedWorkouts,
    periodizedError,
    setPeriodizedLoaded,
    setPeriodizedWorkouts,
    setPeriodizedError,
    loadWorkoutFullById,
  }
}
