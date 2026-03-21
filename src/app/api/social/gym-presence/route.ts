import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

// GET /api/social/gym-presence — who is training at the same gym right now
export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const gymId = searchParams.get('gym_id')
  if (!gymId) return NextResponse.json({ ok: false, error: 'Missing gym_id' }, { status: 400 })

  const userId = auth.user.id

  // Only show users who opted in to share presence
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const { data, error } = await auth.supabase
    .from('gym_checkins')
    .select(`
      user_id,
      checked_in_at,
      user_gyms!inner(name),
      profiles:user_id(display_name, avatar_url)
    `)
    .eq('gym_id', gymId)
    .gte('checked_in_at', thirtyMinsAgo)
    .neq('user_id', userId)
    .order('checked_in_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

  // Filter only users who opted in to share presence
  const userIds = (data || []).map((d: Record<string, unknown>) => d.user_id).filter(Boolean)
  if (userIds.length === 0) return NextResponse.json({ ok: true, present: [] })

  const { data: settings } = await auth.supabase
    .from('user_location_settings')
    .select('user_id')
    .in('user_id', userIds as string[])
    .eq('share_gym_presence', true)

  const allowedIds = new Set((settings || []).map((s: Record<string, unknown>) => s.user_id))

  const present = (data || [])
    .filter((d: Record<string, unknown>) => allowedIds.has(d.user_id as string))
    .map((d: Record<string, unknown>) => ({
      user_id: d.user_id,
      display_name: (d.profiles as Record<string, unknown>)?.display_name || 'Anônimo',
      avatar_url: (d.profiles as Record<string, unknown>)?.avatar_url || null,
      checked_in_at: d.checked_in_at,
    }))

  return NextResponse.json({ ok: true, present })
}
