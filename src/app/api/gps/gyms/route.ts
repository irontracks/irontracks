import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const gymSchema = z.object({
  name: z.string().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_meters: z.number().int().min(20).max(500).default(100),
  is_primary: z.boolean().default(false),
})

// GET /api/gps/gyms — list user gyms
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('user_gyms')
    .select('id, name, latitude, longitude, radius_meters, is_primary, created_at')
    .eq('user_id', auth.user.id)
    .order('is_primary', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, gyms: data })
}

// POST /api/gps/gyms — add a gym
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const parsed = gymSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })

  const { name, latitude, longitude, radius_meters, is_primary } = parsed.data

  // If setting as primary, unset others first
  if (is_primary) {
    await auth.supabase
      .from('user_gyms')
      .update({ is_primary: false })
      .eq('user_id', auth.user.id)
  }

  const { data, error } = await auth.supabase
    .from('user_gyms')
    .insert({
      user_id: auth.user.id,
      name,
      latitude,
      longitude,
      radius_meters,
      is_primary,
    })
    .select('id, name, latitude, longitude, radius_meters, is_primary, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, gym: data })
}

// DELETE /api/gps/gyms — delete a gym
export async function DELETE(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const gymId = searchParams.get('id')
  if (!gymId) return NextResponse.json({ ok: false, error: 'Missing gym id' }, { status: 400 })

  const { error } = await auth.supabase
    .from('user_gyms')
    .delete()
    .eq('id', gymId)
    .eq('user_id', auth.user.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
