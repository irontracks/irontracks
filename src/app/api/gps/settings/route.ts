import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const settingsSchema = z.object({
  gps_enabled: z.boolean().optional(),
  auto_checkin: z.boolean().optional(),
  share_gym_presence: z.boolean().optional(),
  show_on_gym_leaderboard: z.boolean().optional(),
})

// GET /api/gps/settings — get location settings
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { data } = await auth.supabase
    .from('user_location_settings')
    .select('gps_enabled, auto_checkin, share_gym_presence, show_on_gym_leaderboard')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    settings: data || {
      gps_enabled: false,
      auto_checkin: false,
      share_gym_presence: false,
      show_on_gym_leaderboard: false,
    },
  })
}

// PUT /api/gps/settings — update location settings
export async function PUT(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })

  const { error } = await auth.supabase
    .from('user_location_settings')
    .upsert(
      { user_id: auth.user.id, ...parsed.data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
