/**
 * GET /api/social/training-now
 *
 * Quem, DENTRE as pessoas que o chamador segue (accepted), tem uma sessão de
 * treino de fato aberta agora.
 *
 * Antes o card "Treinando Agora" era montado com `/api/social/presence/list` —
 * o sorted set `online_users` do Redis, que só registra "abriu o app". Resultado:
 * amigo aparecia treinando às 5h da manhã porque o iOS despertou o WebView em
 * background. Aqui a fonte é `active_workout_sessions`, cortada por frescor do
 * `updated_at` (a linha não expira sozinha — ver `utils/social/activeSession`).
 *
 * Precisa de service-role: a RLS de SELECT de `active_workout_sessions` só
 * entrega ao dono, ao professor do aluno e ao admin — seguidor não lê. O recorte
 * por "quem eu sigo" é feito ANTES da query, com o client autenticado (a policy
 * de `social_follows` já limita a follower_id = auth.uid()), então nada além dos
 * próprios seguidos do chamador é consultado.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { activeSessionCutoffIso } from '@/utils/social/activeSession'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: follows } = await auth.supabase
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted')

    const followingIds = Array.from(new Set(
      (Array.isArray(follows) ? follows : [])
        .map((r) => String((r as { following_id?: string })?.following_id || '').trim())
        .filter((id) => id && id !== userId),
    ))
    if (!followingIds.length) return NextResponse.json({ ok: true, training: [] })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('active_workout_sessions')
      .select('user_id, started_at, updated_at')
      .in('user_id', followingIds)
      .gte('updated_at', activeSessionCutoffIso())

    if (error) return NextResponse.json({ ok: false, error: 'failed_to_fetch_sessions' }, { status: 500 })

    const training = (Array.isArray(data) ? data : []).map((r) => ({
      user_id: String((r as { user_id?: string })?.user_id || ''),
      started_at: String((r as { started_at?: string })?.started_at || ''),
    })).filter((r) => r.user_id)

    return NextResponse.json({ ok: true, training })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
