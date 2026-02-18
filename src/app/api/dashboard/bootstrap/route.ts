import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { errorResponse } from '@/utils/api'

export const dynamic = 'force-dynamic'

import { SupabaseClient } from '@supabase/supabase-js'

interface DbRow {
  id?: string
  workout_id?: string
  exercise_id?: string
  [key: string]: unknown
}

const toDbRow = (v: unknown): DbRow =>
  v && typeof v === 'object' ? (v as DbRow) : {}

const hydrateWorkouts = async (supabase: SupabaseClient, rows: unknown[]) => {
  const base = Array.isArray(rows) ? rows.filter((x) => x && typeof x === 'object') : []
  const workoutIds = base.map((w) => toDbRow(w).id).filter(Boolean) as string[]
  if (!workoutIds.length) return base.map((w) => ({ ...toDbRow(w), exercises: [] }))

  let exercises: DbRow[] = []
  try {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .in('workout_id', workoutIds)
      .order('order', { ascending: true })
      .limit(5000)
    exercises = Array.isArray(data) ? (data as DbRow[]) : []
  } catch {
    exercises = []
  }

  const exerciseIds = exercises.map((e) => e.id).filter(Boolean) as string[]
  let sets: DbRow[] = []
  if (exerciseIds.length) {
    try {
      const { data } = await supabase
        .from('sets')
        .select('*')
        .in('exercise_id', exerciseIds)
        .order('set_number', { ascending: true })
        .limit(20000)
      sets = Array.isArray(data) ? (data as DbRow[]) : []
    } catch {
      sets = []
    }
  }

  const setsByExercise = new Map<string, DbRow[]>()
  for (const s of sets) {
    const eid = s.exercise_id
    if (!eid) continue
    const list = setsByExercise.get(eid) ?? []
    list.push(s)
    setsByExercise.set(eid, list)
  }

  const exByWorkout = new Map<string, DbRow[]>()
  for (const ex of exercises) {
    const wid = ex.workout_id
    if (!wid) continue
    const exWithSets = { ...ex, sets: setsByExercise.get(ex.id ?? '') ?? [] }
    const list = exByWorkout.get(wid) ?? []
    list.push(exWithSets)
    exByWorkout.set(wid, list)
  }

  return base.map((w) => {
    const row = toDbRow(w)
    return { ...row, exercises: exByWorkout.get(row.id ?? '') ?? [] }
  })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, photo_url, role')
      .eq('id', user.id)
      .maybeSingle()

    let workouts: unknown[] = []
    try {
      const { data } = await supabase
        .from('workouts')
        .select('*')
        .eq('is_template', true)
        .eq('user_id', user.id)
        .order('name', { ascending: true })
        .limit(500)
      workouts = Array.isArray(data) ? data : []
    } catch {
      workouts = []
    }

    if (!workouts.length) {
      try {
        const { data } = await supabase
          .from('workouts')
          .select('*')
          .eq('user_id', user.id)
          .order('name', { ascending: true })
          .limit(500)
        workouts = Array.isArray(data) ? data : []
      } catch {
        workouts = []
      }
    }

    if (!workouts.length) {
      try {
        const { data: student } = await supabase.from('students').select('id').eq('user_id', user.id).maybeSingle()
        const studentId = student?.id ? String(student.id) : ''
        if (studentId) {
          const { data } = await supabase
            .from('workouts')
            .select('*')
            .eq('is_template', true)
            .or(`user_id.eq.${studentId},student_id.eq.${studentId}`)
            .order('name', { ascending: true })
            .limit(500)
          workouts = Array.isArray(data) ? data : []
        }
      } catch {
        workouts = []
      }
    }

    const hydrated = await hydrateWorkouts(supabase, workouts)

    return NextResponse.json(
      {
        ok: true,
        user: { id: user.id, email: user.email ?? null },
        profile: profile || null,
        workouts: hydrated,
      },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    )
  } catch (e) {
    return errorResponse(e)
  }
}
