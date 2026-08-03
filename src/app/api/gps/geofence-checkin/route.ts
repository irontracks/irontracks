/**
 * POST /api/gps/geofence-checkin — registra o check-in disparado pelo geofence do iOS.
 *
 * Por que não usa `POST /api/gps/checkin`
 * ───────────────────────────────────────
 * Aquela rota exige `gym_id` de `user_gyms`, e o geofence não tem um: a academia
 * favorita dele mora em `user_settings.preferences` (nome + lat/lng), um cadastro
 * paralelo que nunca conversou com o outro. O efeito medido em 03/08/2026: o
 * geofence estava ATIVO e `gym_checkins` tinha ZERO linhas em toda a produção —
 * chegar na academia nunca virava check-in, e o Mapa de Treinos ficava vazio para
 * todo mundo.
 *
 * Esta rota é a ponte: resolve (ou cria) a linha de `user_gyms` correspondente ao
 * favorito e grava o check-in com um `gym_id` real. A academia criada aqui é a
 * MESMA que aparece no Perfil — não é um terceiro cadastro.
 *
 * Proteções: mesmas da rota irmã — rate limit por user+IP e janela anti-duplicata
 * de 5 min por (user, gym). O throttle de 4 h do lado nativo é independente e não
 * substitui esta janela: com o app aberto e o toque na notificação, o mesmo evento
 * pode chegar por dois caminhos.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'
import { parseJsonBody } from '@/utils/zod'
import { matchFavoriteGym } from '@/utils/gps/matchGym'

export const dynamic = 'force-dynamic'

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000

const bodySchema = z.object({
  /** Nome do favorito. Serve pra nomear a academia quando ela ainda não existe. */
  name: z.string().trim().min(1).max(60),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strip()

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`gps:geofence-checkin:${auth.user.id}:${ip}`, 5, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = await parseJsonBody(req, bodySchema)
  if (parsed.response || !parsed.data) return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
  const { name, latitude, longitude } = parsed.data

  const { data: gymRows, error: gymsError } = await auth.supabase
    .from('user_gyms')
    .select('id, name, latitude, longitude')
    .eq('user_id', auth.user.id)
    .limit(20)
  if (gymsError) return respondDbError('gps:geofence-checkin:gyms', gymsError)

  const rows = Array.isArray(gymRows) ? gymRows : []
  const matched = matchFavoriteGym(rows, { name, lat: latitude, lng: longitude })

  let gymId = matched?.id ?? ''
  let createdGym = false
  if (!gymId) {
    // Primeira chegada: o favorito do geofence vira academia de verdade, visível
    // no Perfil. `is_primary` só quando é a única — não rebaixa uma escolha do usuário.
    const { data: created, error: createError } = await auth.supabase
      .from('user_gyms')
      .insert({
        user_id: auth.user.id,
        name,
        latitude,
        longitude,
        radius_meters: 100,
        is_primary: rows.length === 0,
      })
      .select('id')
      .single()
    if (createError) return respondDbError('gps:geofence-checkin:create-gym', createError)
    gymId = String(created?.id ?? '')
    createdGym = true
  }
  if (!gymId) return NextResponse.json({ ok: false, error: 'gym_unresolved' }, { status: 500 })

  const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()
  const { data: recent } = await auth.supabase
    .from('gym_checkins')
    .select('id, checked_in_at')
    .eq('user_id', auth.user.id)
    .eq('gym_id', gymId)
    .gte('checked_in_at', windowStart)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent?.id) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      createdGym,
      checkin: { id: recent.id, gym_id: gymId, checked_in_at: recent.checked_in_at },
    })
  }

  const { data, error } = await auth.supabase
    .from('gym_checkins')
    .insert({ user_id: auth.user.id, gym_id: gymId, latitude, longitude })
    .select('id, gym_id, checked_in_at')
    .single()

  if (error) return respondDbError('gps:geofence-checkin:insert', error)
  return NextResponse.json({ ok: true, createdGym, checkin: data })
}
