/**
 * API: POST /api/workout-photo-import/create
 *
 * Abre uma sessão de import de treino por foto/PDF (status=pending) e devolve o
 * id. O cliente então sobe os arquivos via /api/workout-photo-import/signed-upload
 * e dispara /api/ai/workout-photo-extract.
 *
 * Acesso: VIP — ou a PRIMEIRA ficha grátis (demonstração). O gate mora AQUI, na
 * porta de entrada, e não na extração: travar depois do upload deixaria o free
 * com a foto no nosso bucket e sem o valor que ele veio buscar.
 *
 * Rate limit: 10 req/min por usuário.
 */
import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkWorkoutImportAccess } from '@/utils/vip/workoutImportAccess'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`workout-import:create:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkWorkoutImportAccess(auth.supabase, userId, 'create')
    if (!access.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'vip_required',
          upgradeRequired: true,
          message: 'A primeira ficha foi por nossa conta — importar mais é exclusivo para assinantes VIP. Se você já assina, tente sair e entrar novamente.',
        },
        { status: 403 },
      )
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('workout_photo_imports')
      .insert({ user_id: userId, status: 'pending' })
      .select('id')
      .single()
    if (error) return respondDbError('workout-import:create', error, 400)

    return NextResponse.json({ ok: true, importId: data.id, access: access.reason })
  } catch (e: unknown) {
    return respondInternalError('api:workout-photo-import:create', e)
  }
}
