import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const isMissingTable = (error: unknown) => {
  const e = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const status = Number(e.status)
  const code = e.code ? String(e.code) : ''
  const msg = e.message ? String(e.message) : ''
  return status === 404 || code === '42P01' || /does not exist/i.test(msg) || /not found/i.test(msg)
}

// Coleta tolerante a tabela ausente — o app roda em ambientes onde nem toda
// tabela existe (ex.: GPS/academia só em algumas migrations). Usa o client do
// próprio usuário (RLS) para nunca vazar dado de outra pessoa.
const safeSelect = async (
  build: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<unknown[]> => {
  try {
    const { data, error } = await build()
    if (error) {
      if (isMissingTable(error)) return []
      throw error
    }
    return Array.isArray(data) ? data : []
  } catch (e: unknown) {
    if (isMissingTable(e)) return []
    throw e
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`account:export:${auth.user.id}:${ip}`, 3, 10 * 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const supabase = auth.supabase
    const userId = auth.user.id

    // Perfil (registro único do próprio usuário)
    const profileRows = await safeSelect(() =>
      supabase.from('profiles').select('*').eq('id', userId).limit(1),
    )

    const [
      settings,
      workouts,
      assessments,
      userGyms,
      gymCheckins,
      locationSettings,
      cardioTracks,
    ] = await Promise.all([
      safeSelect(() => supabase.from('user_settings').select('*').eq('user_id', userId)),
      safeSelect(() => supabase.from('workouts').select('*').eq('user_id', userId).limit(5000)),
      safeSelect(() =>
        supabase.from('assessments').select('*').or(`student_id.eq.${userId},trainer_id.eq.${userId}`).limit(2000),
      ),
      safeSelect(() => supabase.from('user_gyms').select('*').eq('user_id', userId).limit(2000)),
      safeSelect(() => supabase.from('gym_checkins').select('*').eq('user_id', userId).limit(5000)),
      safeSelect(() => supabase.from('user_location_settings').select('*').eq('user_id', userId)),
      safeSelect(() => supabase.from('cardio_tracks').select('*').eq('user_id', userId).limit(5000)),
    ])

    return NextResponse.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      format: 'irontracks-account-export-v1',
      account: {
        id: userId,
        email: auth.user.email ?? null,
        createdAt: auth.user.created_at ?? null,
      },
      profile: profileRows[0] ?? null,
      settings,
      workouts,
      assessments,
      gym: {
        userGyms,
        checkins: gymCheckins,
        locationSettings,
        cardioTracks,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
