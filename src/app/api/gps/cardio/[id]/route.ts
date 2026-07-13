import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

const VALID_ACTIVITY_TYPES = ['running', 'walking', 'cycling', 'swimming', 'other'] as const

const patchSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  perceived_effort: z.number().int().min(1).max(5).nullable().optional(),
  activity_type: z.enum(VALID_ACTIVITY_TYPES).optional(),
})

// GET /api/gps/cardio/[id] — fetch a single track (owner-only) with its route,
// usado pra gerar o Story compartilhável de uma corrida antiga no histórico.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('cardio_tracks')
    .select('id, activity_type, distance_meters, duration_seconds, avg_pace_min_km, max_speed_kmh, calories_estimated, route, started_at')
    .eq('id', id)
    .eq('user_id', auth.user.id) // RLS guard — só o dono lê a própria rota
    .single()

  if (error) return respondDbError('gps:cardio:get', error)
  return NextResponse.json({ ok: true, track: data })
}

// PATCH /api/gps/cardio/[id] — update notes / perceived_effort / activity_type
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

  const parsedBody = await parseJsonBody(req, patchSchema)
  if (parsedBody.response) return parsedBody.response
  const parsed = parsedBody.data!

  const { data, error } = await auth.supabase
    .from('cardio_tracks')
    .update(parsed)
    .eq('id', id)
    .eq('user_id', auth.user.id) // RLS guard — user can only update their own
    .select('id')
    .single()

  if (error) return respondDbError('gps:cardio:update', error)
  return NextResponse.json({ ok: true, id: data.id })
}

// DELETE /api/gps/cardio/[id] — permanently delete a cardio session
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

  const { error } = await auth.supabase
    .from('cardio_tracks')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.user.id) // RLS guard

  if (error) return respondDbError('gps:cardio:delete', error)
  return NextResponse.json({ ok: true })
}
