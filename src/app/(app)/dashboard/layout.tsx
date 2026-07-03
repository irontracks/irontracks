// dashboard/layout.tsx Server — renderiza DashboardClientEntry ENVOLVENDO {children}.
//
// Por que existe: sub-rotas (/dashboard/history, /dashboard/admin, etc) NÃO
// podem renderizar DashboardClientEntry separadamente — isso causaria re-mount
// do god component a cada navegação. Em App Router, layouts NÃO re-renderizam
// quando user navega entre sub-rotas, apenas o {children}. Então o app vive
// no layout uma vez só, e {children} é placeholder (cada page.tsx retorna null
// porque o IronTracksAppClient lê usePathname() pra decidir o que renderizar).
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClientEntry from './DashboardClientEntry'
import { resolveRoleByUser } from '@/utils/auth/route'
import { safePg } from '@/utils/safePgFilter'
import { logWarn } from '@/lib/logger'

const hydrateWorkouts = async (
  supabase: Awaited<ReturnType<typeof import('@/utils/supabase/server').createClient>>,
  rows: unknown[],
) => {
  const base = (Array.isArray(rows) ? rows.filter((x) => x && typeof x === 'object') : []) as Record<string, unknown>[]
  const workoutIds = base.map((w) => (w as Record<string, unknown>)?.id).filter(Boolean)
  if (!workoutIds.length) return base.map((w) => ({ ...w, exercises: [] }))

  let exercises: Record<string, unknown>[] = []
  try {
    const { data } = await supabase
      .from('exercises')
      .select('id, workout_id, name, notes, video_url, rest_time, cadence, method, "order", is_unilateral, side_rest_time, transition_time')
      .in('workout_id', workoutIds)
      .order('order', { ascending: true })
      .limit(5000)
    exercises = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  } catch {
    exercises = []
  }

  const exerciseIds = exercises.map((e) => e?.id as string | undefined).filter(Boolean)
  let sets: Record<string, unknown>[] = []
  if (exerciseIds.length) {
    try {
      const { data } = await supabase
        .from('sets')
        .select('id, exercise_id, set_number, reps, rpe, weight, is_warmup, advanced_config')
        .in('exercise_id', exerciseIds)
        .order('set_number', { ascending: true })
        .limit(20000)
      sets = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
    } catch {
      sets = []
    }
  }

  const setsByExercise = new Map<string, unknown[]>()
  for (const s of sets) {
    const eid = s?.exercise_id as string | undefined
    if (!eid) continue
    const list = setsByExercise.get(eid) || []
    list.push(s)
    setsByExercise.set(eid, list)
  }

  const exByWorkout = new Map<string, unknown[]>()
  for (const ex of exercises) {
    const wid = ex?.workout_id as string | undefined
    if (!wid) continue
    const exWithSets = { ...ex, sets: setsByExercise.get(ex.id as string) || [] }
    const list = exByWorkout.get(wid) || []
    list.push(exWithSets)
    exByWorkout.set(wid, list)
  }

  return base.map((w) => ({ ...w, exercises: exByWorkout.get((w as Record<string, unknown>).id as string) || [] }))
}

// RPC get_dashboard_bootstrap: 1 round-trip com profile + workouts JÁ hidratados
// (exercises + sets inline, mesmos fallbacks template→any→student da cadeia manual;
// migration 20260703210000 completou created_by/is_unilateral/side_rest_time/
// transition_time/is_warmup). null em erro/shape inesperado → cai na cadeia manual.
const tryRpcBootstrap = async (
  supabase: Awaited<ReturnType<typeof import('@/utils/supabase/server').createClient>>,
  userId: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const { data, error } = await supabase.rpc('get_dashboard_bootstrap', { p_user_id: userId })
    if (error) {
      // Fallback funciona, mas a regressão de latência não pode ficar invisível.
      logWarn('dashboard:ssr', 'bootstrap RPC falhou — usando cadeia manual', error.message)
      return null
    }
    if (data && typeof data === 'object' && (data as Record<string, unknown>).ok) {
      return data as Record<string, unknown>
    }
    logWarn('dashboard:ssr', 'bootstrap RPC com shape inesperado — usando cadeia manual')
    return null
  } catch (e) {
    logWarn('dashboard:ssr', 'bootstrap RPC lançou — usando cadeia manual', e instanceof Error ? e.message : String(e))
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user?.id) redirect('/?next=/dashboard')

  const initialUser = {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? {},
  }

  // Caminho rápido: RPC (1 round-trip) + role em paralelo. A cadeia manual abaixo fica
  // como fallback integral (RPC ausente/erro) — pior caso = comportamento anterior.
  const [rpcData, resolved] = await Promise.all([
    tryRpcBootstrap(supabase, user.id),
    resolveRoleByUser({ id: user.id, email: user.email ?? null }),
  ])

  let initialProfile: { role: string | null; display_name: string | null; photo_url: string | null }
  let initialWorkouts: unknown[]

  const rpcProfile = rpcData && rpcData.profile && typeof rpcData.profile === 'object'
    ? (rpcData.profile as Record<string, unknown>)
    : null

  if (rpcData && Array.isArray(rpcData.workouts)) {
    initialProfile = {
      role: resolved?.role ?? (typeof rpcProfile?.role === 'string' ? rpcProfile.role : null),
      display_name: typeof rpcProfile?.display_name === 'string' ? rpcProfile.display_name : null,
      photo_url: typeof rpcProfile?.photo_url === 'string' ? rpcProfile.photo_url : null,
    }
    initialWorkouts = rpcData.workouts
  } else {
    // ── Fallback: cadeia manual (comportamento anterior, intacto) ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, display_name, photo_url')
      .eq('id', user.id)
      .maybeSingle()

    initialProfile = {
      role: resolved?.role ?? profile?.role ?? null,
      display_name: profile?.display_name ?? null,
      photo_url: profile?.photo_url ?? null,
    }

    let baseWorkouts: unknown[] = []
    try {
      const { data } = await supabase
        .from('workouts')
        .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
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
        const { data } = await supabase.from('workouts').select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id').eq('user_id', user.id).order('name', { ascending: true }).limit(500)
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
            .select('id, name, notes, is_template, user_id, created_by, archived_at, sort_order, created_at, student_id')
            .eq('is_template', true)
            .or(`user_id.eq.${safePg(studentId)},student_id.eq.${safePg(studentId)}`)
            .order('name', { ascending: true })
            .limit(500)
          baseWorkouts = Array.isArray(data) ? data : []
        }
      } catch {
        baseWorkouts = []
      }
    }

    initialWorkouts = await hydrateWorkouts(supabase, baseWorkouts)
  }

  return (
    <>
      <DashboardClientEntry initialUser={initialUser} initialProfile={initialProfile} initialWorkouts={initialWorkouts} />
      {/*
        {children} é renderizado mas mantido invisível — cada sub-rota page.tsx
        retorna null. O IronTracksAppClient lê usePathname() pra decidir view.
        Sem `{children}`, Next.js reclama de "page without UI" — então mantemos
        aqui pra completar o slot.
      */}
      <div style={{ display: 'none' }} aria-hidden>{children}</div>
    </>
  )
}
