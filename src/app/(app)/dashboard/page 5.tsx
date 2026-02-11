import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClientEntry from './DashboardClientEntry'
import { resolveRoleByUser } from '@/utils/auth/route'

type SP = Record<string, string | string[] | undefined>

const hydrateWorkouts = async (supabase: any, rows: any[]) => {
  const base = Array.isArray(rows) ? rows.filter((x) => x && typeof x === 'object') : []
  const workoutIds = base.map((w) => w?.id).filter(Boolean)
  if (!workoutIds.length) return base.map((w) => ({ ...w, exercises: [] }))

  let exercises: any[] = []
  try {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .in('workout_id', workoutIds)
      .order('order', { ascending: true })
      .limit(5000)
    exercises = Array.isArray(data) ? data : []
  } catch {
    exercises = []
  }

  const exerciseIds = exercises.map((e) => e?.id).filter(Boolean)
  let sets: any[] = []
  if (exerciseIds.length) {
    try {
      const { data } = await supabase
        .from('sets')
        .select('*')
        .in('exercise_id', exerciseIds)
        .order('set_number', { ascending: true })
        .limit(20000)
      sets = Array.isArray(data) ? data : []
    } catch {
      sets = []
    }
  }

  const setsByExercise = new Map<string, any[]>()
  for (const s of sets) {
    const eid = s?.exercise_id
    if (!eid) continue
    const list = setsByExercise.get(eid) || []
    list.push(s)
    setsByExercise.set(eid, list)
  }

  const exByWorkout = new Map<string, any[]>()
  for (const ex of exercises) {
    const wid = ex?.workout_id
    if (!wid) continue
    const exWithSets = { ...ex, sets: setsByExercise.get(ex.id) || [] }
    const list = exByWorkout.get(wid) || []
    list.push(exWithSets)
    exByWorkout.set(wid, list)
  }

  return base.map((w) => ({ ...w, exercises: exByWorkout.get(w.id) || [] }))
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<SP> }) {
  const sp = await searchParams
  const code = typeof sp?.code === 'string' ? sp?.code : ''
  const next = typeof sp?.next === 'string' ? sp?.next : ''
  if (code) {
    const safeNext = next && next.startsWith('/') ? next : '/dashboard'
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(safeNext)}`)
  }

  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user?.id) redirect('/?next=/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name, photo_url')
    .eq('id', user.id)
    .maybeSingle()

  const resolved = await resolveRoleByUser({ id: user.id, email: user.email ?? null })

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  const initialProfile = {
    role: resolved?.role ?? profile?.role ?? null,
    display_name: profile?.display_name ?? null,
    photo_url: profile?.photo_url ?? null,
  }

  let baseWorkouts: any[] = []
  try {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('is_template', true)
      .eq('user_id', user.id)
      .order('name', { ascending: true })
      .limit(500)
    baseWorkouts = Array.isArray(data) ? data : []
  } catch {
    baseWorkouts = []
  }

  if (!baseWorkouts.length) {
    try {
      const { data } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('name', { ascending: true }).limit(500)
      baseWorkouts = Array.isArray(data) ? data : []
    } catch {
      baseWorkouts = []
    }
  }

  if (!baseWorkouts.length) {
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
        baseWorkouts = Array.isArray(data) ? data : []
      }
    } catch {
      baseWorkouts = []
    }
  }

  const initialWorkouts = await hydrateWorkouts(supabase, baseWorkouts)

  return <DashboardClientEntry initialUser={initialUser} initialProfile={initialProfile} initialWorkouts={initialWorkouts} />
}
