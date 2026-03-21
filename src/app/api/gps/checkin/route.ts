import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const checkinSchema = z.object({
  gym_id: z.string().uuid(),
  workout_id: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})

// POST /api/gps/checkin — register check-in
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const parsed = checkinSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })

  const { gym_id, workout_id, latitude, longitude } = parsed.data

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

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
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

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, checkins: data })
}
