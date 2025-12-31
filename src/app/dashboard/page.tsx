import Link from 'next/link'

import DashboardApp from '@/components/dashboard/DashboardApp'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const authUser = data?.user

  const normalizedEmail = String(authUser?.email || '').toLowerCase().trim()

  if (!authUser?.id) {
    return (
      <div className="min-h-screen bg-neutral-900 text-white p-6 md:p-10">
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-xl bg-neutral-800 p-6 border border-neutral-700">
            <h1 className="text-2xl font-black text-white">Acesso restrito</h1>
            <p className="text-neutral-400 mt-2">Faça login para acessar o Dashboard.</p>
            <Link
              href="/"
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 font-black text-black hover:bg-yellow-400"
            >
              Voltar para o início
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const normalizeTeacherStatus = (value: any) => {
    const s = String(value || '').toLowerCase().trim()
    if (!s) return 'pending'
    if (['pago', 'paid', 'paid_out', 'paidout'].includes(s)) return 'active'
    if (['ativo', 'active'].includes(s)) return 'active'
    if (['atrasado', 'overdue', 'late', 'em atraso'].includes(s)) return 'pending'
    if (['pendente', 'pending'].includes(s)) return 'pending'
    if (['cancelar', 'cancelled', 'canceled', 'suspended', 'inactive', 'inativo'].includes(s)) return 'cancelled'
    return s
  }

  const mapWorkoutRow = (w: any) => {
    const rawExercises = Array.isArray(w?.exercises) ? w.exercises : []
    const exs = rawExercises
      .filter((e: any) => e && typeof e === 'object')
      .sort((a: any, b: any) => (a?.order || 0) - (b?.order || 0))
      .map((e: any) => {
        try {
          const isCardio = String(e?.method || '').toLowerCase() === 'cardio'
          const dbSets = Array.isArray(e?.sets) ? e.sets.filter((s: any) => s && typeof s === 'object') : []

          const sortedSets = dbSets.slice().sort((aSet: any, bSet: any) => (aSet?.set_number || 0) - (bSet?.set_number || 0))
          const setsCount = sortedSets.length || (isCardio ? 1 : 4)

          const setDetails = sortedSets.map((s: any, idx: number) => ({
            set_number: s?.set_number ?? idx + 1,
            reps: s?.reps ?? null,
            rpe: s?.rpe ?? null,
            weight: s?.weight ?? null,
            is_warmup: !!(s?.is_warmup ?? (s as any)?.isWarmup),
            advanced_config: s?.advanced_config ?? (s as any)?.advancedConfig ?? null,
          }))

          const nonEmptyReps = setDetails.map((sd: any) => sd?.reps).filter((r: any) => r !== null && r !== undefined && r !== '')
          const defaultReps = isCardio ? '20' : '10'
          let repsHeader = defaultReps
          if (nonEmptyReps.length > 0) {
            const uniqueReps = Array.from(new Set(nonEmptyReps))
            repsHeader = (uniqueReps.length === 1 ? uniqueReps[0] : nonEmptyReps[0]) ?? defaultReps
          }

          const rpeValues = setDetails.map((sd: any) => sd?.rpe).filter((v: any) => v !== null && v !== undefined && !Number.isNaN(v))
          const defaultRpe = isCardio ? 5 : 8
          const rpeHeader = rpeValues.length > 0 ? rpeValues[0] : defaultRpe

          return {
            id: e?.id,
            name: e?.name,
            notes: e?.notes,
            videoUrl: e?.video_url,
            restTime: e?.rest_time,
            cadence: e?.cadence,
            method: e?.method,
            sets: setsCount,
            reps: repsHeader,
            rpe: rpeHeader,
            setDetails,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return {
      id: w?.id,
      user_id: w?.user_id ?? null,
      created_by: w?.created_by ?? null,
      title: w?.title ?? w?.name ?? 'Treino',
      notes: w?.notes ?? null,
      exercises: exs,
    }
  }

  let displayName: string | null = null
  let photoURL: string | null = null
  let role: string | null = null
  let initialProfileDraftName = ''
  let initialProfileIncomplete = false

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, photo_url, role')
      .eq('id', authUser.id)
      .maybeSingle()

    displayName = (profile?.display_name ?? null) as any
    photoURL = (profile?.photo_url ?? null) as any
    role = (profile?.role ?? null) as any
  } catch {
    displayName = null
    photoURL = null
    role = null
  }

  initialProfileDraftName = String(displayName || '').trim()
  initialProfileIncomplete = !initialProfileDraftName

  let isCoach = false
  let coachPending = false

  const isAdminEmail = normalizedEmail && normalizedEmail === ADMIN_EMAIL.toLowerCase()
  if (isAdminEmail) {
    role = 'admin'
    isCoach = true
    coachPending = false
  }

  const isAdminRole = String(role || '').toLowerCase().trim() === 'admin'
  if (isAdminRole) {
    isCoach = true
    coachPending = false
  }

  if (!isAdminEmail && !isAdminRole) {
    try {
      const admin = createAdminClient()
      const escapedEmailForLike = normalizedEmail.replace(/([%_\\])/g, '\\$1')

      const select = 'id, status, payment_status, email, created_at, user_id'
      const byUser = await admin
        .from('teachers')
        .select(select)
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const byEmail =
        !byUser?.data && normalizedEmail
          ? await admin
              .from('teachers')
              .select(select)
              .ilike('email', escapedEmailForLike)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : null

      const teacher = byUser?.data || byEmail?.data || null
      const status = normalizeTeacherStatus(teacher?.status || teacher?.payment_status)
      if (teacher && status !== 'cancelled') {
        isCoach = true
        coachPending = status !== 'active'
      }
    } catch {}
  }

  let initialWorkouts: any[] = []
  try {
    const { data: rows, error } = await supabase
      .from('workouts')
      .select('*, exercises(*, sets(*))')
      .eq('is_template', true)
      .eq('user_id', authUser.id)
      .order('name', { ascending: true })
    if (error) throw error
    initialWorkouts = Array.isArray(rows) ? rows.map(mapWorkoutRow).filter(Boolean) : []
  } catch {
    initialWorkouts = []
  }

  return (
    <DashboardApp
      user={{
        id: authUser.id,
        email: authUser.email ?? null,
        displayName,
        photoURL,
        role,
      }}
      isCoach={isCoach}
      coachPending={coachPending}
      initialProfileIncomplete={initialProfileIncomplete}
      initialProfileDraftName={initialProfileDraftName}
      initialWorkouts={initialWorkouts as any}
    />
  )
}
