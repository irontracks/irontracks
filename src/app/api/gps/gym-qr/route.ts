/**
 * GET /api/gps/gym-qr?gym_id=UUID
 *
 * Returns the QR token + the check-in URL for a gym owned by the current user.
 * Only the owner (coach/teacher) can fetch their gym's QR code.
 *
 * POST /api/gps/gym-qr
 * Regenerates the QR token (rotate for security).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const gym_id = req.nextUrl.searchParams.get('gym_id')
  if (!gym_id) return NextResponse.json({ ok: false, error: 'missing_gym_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: gym, error } = await admin
    .from('user_gyms')
    .select('id, name, qr_token')
    .eq('id', gym_id)
    .eq('user_id', auth.user.id) // must be owner
    .maybeSingle()

  if (error || !gym) return NextResponse.json({ ok: false, error: 'gym_not_found' }, { status: 404 })

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.irontracks.com.br'
  const checkinUrl = `${baseUrl}/checkin?token=${gym.qr_token}`

  return NextResponse.json({ ok: true, gym_id: gym.id, name: gym.name, qr_token: gym.qr_token, checkinUrl })
}

const RotateSchema = z.object({ gym_id: z.string().uuid() })

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const parsed = await parseJsonBody(req, RotateSchema)
  if (parsed.response) return parsed.response
  const { gym_id } = parsed.data!

  const admin = createAdminClient()
  const { data: gym, error } = await admin
    .from('user_gyms')
    .update({ qr_token: crypto.randomUUID() })
    .eq('id', gym_id)
    .eq('user_id', auth.user.id)
    .select('id, name, qr_token')
    .single()

  if (error || !gym) return NextResponse.json({ ok: false, error: 'gym_not_found' }, { status: 404 })

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.irontracks.com.br'
  const checkinUrl = `${baseUrl}/checkin?token=${gym.qr_token}`

  return NextResponse.json({ ok: true, gym_id: gym.id, name: gym.name, qr_token: gym.qr_token, checkinUrl })
}
