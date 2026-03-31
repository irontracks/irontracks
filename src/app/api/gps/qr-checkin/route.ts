/**
 * POST /api/gps/qr-checkin
 *
 * Performs a gym check-in using a QR token (no GPS required).
 * The QR token identifies the gym uniquely.
 *
 * Body: { qr_token: string, workout_id?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  qr_token: z.string().uuid(),
  workout_id: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  // Rate limit: max 10 QR check-ins per minute per user
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`qr-checkin:${auth.user.id}:${ip}`, 10, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = await parseJsonBody(req, BodySchema)
  if (parsed.response) return parsed.response
  const { qr_token, workout_id } = parsed.data!

  const admin = createAdminClient()

  // Resolve gym from QR token
  const { data: gym, error: gymErr } = await admin
    .from('user_gyms')
    .select('id, name, user_id, latitude, longitude')
    .eq('qr_token', qr_token)
    .maybeSingle()

  if (gymErr || !gym) {
    return NextResponse.json({ ok: false, error: 'qr_invalid' }, { status: 404 })
  }

  // Prevent duplicate check-in within last 5 min
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: recent } = await admin
    .from('gym_checkins')
    .select('id')
    .eq('user_id', auth.user.id)
    .eq('gym_id', gym.id)
    .gte('checked_in_at', fiveMinAgo)
    .maybeSingle()

  if (recent?.id) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      gym: { id: gym.id, name: gym.name },
    })
  }

  // Create check-in (latitude/longitude from gym coords since no GPS needed)
  const { data: checkin, error: checkinErr } = await admin
    .from('gym_checkins')
    .insert({
      user_id: auth.user.id,
      gym_id: gym.id,
      workout_id: workout_id ?? null,
      latitude: gym.latitude,
      longitude: gym.longitude,
    })
    .select('id, gym_id, checked_in_at')
    .single()

  if (checkinErr) {
    return NextResponse.json({ ok: false, error: checkinErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checkin,
    gym: { id: gym.id, name: gym.name },
  })
}
