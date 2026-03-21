import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const routePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ts: z.number(),
  alt: z.number().nullable().optional(),
})

const saveTrackSchema = z.object({
  workout_id: z.string().uuid().nullable().optional(),
  distance_meters: z.number().min(0).max(500_000), // max 500km
  duration_seconds: z.number().int().min(0).max(86_400), // max 24h
  avg_pace_min_km: z.number().nullable().optional(),
  max_speed_kmh: z.number().nullable().optional(),
  calories_estimated: z.number().int().min(0).max(50_000).optional(),
  route: z.array(routePointSchema).max(10_000), // max 10k points
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
})

// POST /api/gps/cardio/save — save a cardio track
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const parsed = saveTrackSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  const { data, error } = await auth.supabase
    .from('cardio_tracks')
    .insert({
      user_id: auth.user.id,
      workout_id: d.workout_id || null,
      distance_meters: d.distance_meters,
      duration_seconds: d.duration_seconds,
      avg_pace_min_km: d.avg_pace_min_km ?? null,
      max_speed_kmh: d.max_speed_kmh ?? null,
      calories_estimated: d.calories_estimated ?? 0,
      route: d.route,
      started_at: d.started_at,
      finished_at: d.finished_at,
    })
    .select('id, distance_meters, duration_seconds, avg_pace_min_km, calories_estimated, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, track: data })
}

// GET /api/gps/cardio/save — list cardio history
export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 50)

  const { data, error } = await auth.supabase
    .from('cardio_tracks')
    .select('id, workout_id, distance_meters, duration_seconds, avg_pace_min_km, max_speed_kmh, calories_estimated, started_at, finished_at, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, tracks: data })
}
