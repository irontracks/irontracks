import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

// GET /api/social/gym-leaderboard — ranking of workouts at a gym
export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const gymId = searchParams.get('gym_id')
  const period = searchParams.get('period') || 'week' // week | month

  if (!gymId) return NextResponse.json({ ok: false, error: 'Missing gym_id' }, { status: 400 })

  const now = new Date()
  const startDate = new Date(
    period === 'month'
      ? now.getTime() - 30 * 24 * 60 * 60 * 1000
      : now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Count check-ins per user at this gym during the period
  const { data, error } = await auth.supabase
    .from('gym_checkins')
    .select('user_id')
    .eq('gym_id', gymId)
    .gte('checked_in_at', startDate)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  if (!data || data.length === 0) return NextResponse.json({ ok: true, leaderboard: [] })

  // Count per user
  const counts: Record<string, number> = {}
  for (const row of data as Array<{ user_id: string }>) {
    counts[row.user_id] = (counts[row.user_id] || 0) + 1
  }

  // Sort by count desc
  const sorted = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)

  const userIds = sorted.map(([id]) => id)

  // Only include users who opted in
  const { data: settings } = await auth.supabase
    .from('user_location_settings')
    .select('user_id')
    .in('user_id', userIds)
    .eq('show_on_gym_leaderboard', true)

  const allowedIds = new Set((settings || []).map((s: Record<string, unknown>) => s.user_id))

  // Get profiles
  const { data: profiles } = await auth.supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map((profiles || []).map((p: Record<string, unknown>) => [p.id, p]))

  const leaderboard = sorted
    .filter(([id]) => allowedIds.has(id))
    .map(([id, count], i) => {
      const profile = profileMap.get(id) as Record<string, unknown> | undefined
      return {
        rank: i + 1,
        user_id: id,
        display_name: profile?.display_name || 'Anônimo',
        avatar_url: profile?.avatar_url || null,
        checkin_count: count,
        is_me: id === auth.user.id,
      }
    })

  return NextResponse.json({ ok: true, leaderboard, period })
}
