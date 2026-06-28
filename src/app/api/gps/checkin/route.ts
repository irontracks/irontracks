/**
 * POST /api/gps/checkin — registrar check-in via GPS
 * GET  /api/gps/checkin — listar histórico de check-ins do usuário
 *
 * Proteções
 * ─────────
 * - Rate limit: 5 req/min por user+IP (proteção contra abuso bruto)
 * - Janela anti-duplicata: 5 min entre check-ins do mesmo (user, gym).
 *   Mesmo padrão do qr-checkin pra manter consistência. Returna
 *   `{ ok: true, duplicate: true }` em vez de erro pra UX boa
 *   (cliente sabe que tá ok, só evitou um row redundante).
 * - Accuracy: rejeita coordenada com erro > 100 m. Permite 100 m
 *   pra cobrir GPS indoor mediocre sem fraude grosseira.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

/** Limite de erro do GPS aceito. Usuários com GPS ruim acima desse
 *  limiar caem no fluxo manual ou no QR check-in. */
const MAX_GPS_ACCURACY_METERS = 100

const checkinSchema = z.object({
  gym_id: z.string().uuid(),
  workout_id: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Erro do GPS em metros (do Geolocation API). Opcional para retro-
   *  compatibilidade — clientes antigos seguem funcionando. Quando
   *  presente, validamos o limite. */
  accuracy: z.number().nonnegative().optional(),
}).strip()

// POST /api/gps/checkin — register check-in
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`gps:checkin:${auth.user.id}:${ip}`, 5, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const parsed = checkinSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })

  const { gym_id, workout_id, latitude, longitude, accuracy } = parsed.data

  // Sanidade do GPS — leitura imprecisa pode forjar check-in fora do
  // raio real da academia. Mensagem de erro reaproveitada pelo cliente
  // pra orientar o usuário (ir pra fora, esperar, ou usar QR).
  if (typeof accuracy === 'number' && accuracy > MAX_GPS_ACCURACY_METERS) {
    return NextResponse.json(
      {
        ok: false,
        error: 'gps_inaccurate',
        message: `Sinal de GPS muito impreciso (${Math.round(accuracy)}m). Saia do prédio ou use o QR Code da academia.`,
      },
      { status: 400 },
    )
  }

  // Janela anti-duplicata: o mesmo (user, gym) só pode ter 1 check-in
  // a cada 5 minutos. Sem isso, double-tap, F5, ou pull-to-refresh
  // gera múltiplos check-ins inflando leaderboard e streak.
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await auth.supabase
    .from('gym_checkins')
    .select('id, checked_in_at')
    .eq('user_id', auth.user.id)
    .eq('gym_id', gym_id)
    .gte('checked_in_at', fiveMinAgo)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent?.id) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      checkin: { id: recent.id, gym_id, checked_in_at: recent.checked_in_at },
    })
  }

  const { data, error } = await auth.supabase
    .from('gym_checkins')
    .insert({
      user_id: auth.user.id,
      gym_id,
      workout_id: workout_id || null,
      latitude,
      longitude,
    })
    .select('id, gym_id, workout_id, checked_in_at')
    .single()

  if (error) return respondDbError('gps:checkin:insert', error)
  return NextResponse.json({ ok: true, checkin: data })
}

// GET /api/gps/checkin — list check-in history
export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 30, 100)

  const { data, error } = await auth.supabase
    .from('gym_checkins')
    .select('id, gym_id, workout_id, latitude, longitude, checked_in_at, user_gyms(name)')
    .eq('user_id', auth.user.id)
    .order('checked_in_at', { ascending: false })
    .limit(limit)

  if (error) return respondDbError('gps:checkin:list', error)
  return NextResponse.json({ ok: true, checkins: data })
}
