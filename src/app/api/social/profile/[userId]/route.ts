import { NextResponse } from 'next/server'
import { logWarn } from '@/lib/logger'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/social/profile/[userId] — Public profile for a followed user.
 * Returns stats (total workouts, streak, frequency), top PRs, and profile info.
 * Only accessible for users I follow (accepted status).
 */
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const myId = String(auth.user.id || '').trim()
    if (!myId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:profile:${myId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const { userId: targetUserId } = await params
    const targetId = String(targetUserId || '').trim()
    if (!targetId) return NextResponse.json({ ok: false, error: 'missing user id' }, { status: 400 })

    const admin = createAdminClient()

    // Allow viewing own profile or followed user's profile
    if (targetId !== myId) {
      const { data: followRow } = await admin
        .from('social_follows')
        .select('status')
        .eq('follower_id', myId)
        .eq('following_id', targetId)
        .eq('status', 'accepted')
        .maybeSingle()

      if (!followRow) {
        return NextResponse.json({ ok: false, error: 'not_following' }, { status: 403 })
      }
    }

    // Fetch profile
    const { data: profile } = await admin
      .from('profiles')
      .select('id, display_name, photo_url, role')
      .eq('id', targetId)
      .maybeSingle()

    if (!profile) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    // Fetch workout stats
    const { count: totalWorkouts } = await admin
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetId)
      .eq('is_template', false)

    // Fetch recent workouts for streak calculation (90-day window)
    const streakWindowStart = new Date()
    streakWindowStart.setDate(streakWindowStart.getDate() - 90)
    const { data: recentWorkouts } = await admin
      .from('workouts')
      .select('date')
      .eq('user_id', targetId)
      .eq('is_template', false)
      .gte('date', streakWindowStart.toISOString())
      .order('date', { ascending: false })
      .limit(200)

    // Calculate streak
    const daySet = new Set<string>()
    const rows = Array.isArray(recentWorkouts) ? recentWorkouts : []
    rows.forEach((r) => {
      try {
        const d = r?.date ? new Date(String(r.date)) : null
        if (!d || Number.isNaN(d.getTime())) return
        daySet.add(d.toISOString().slice(0, 10))
      } catch (e) { logWarn('social:profile', 'silenced', e) }
    })
    let streak = 0
    if (daySet.size) {
      const sorted = Array.from(daySet).sort().reverse()
      let cursor = new Date(`${sorted[0]}T00:00:00.000Z`)
      while (daySet.has(cursor.toISOString().slice(0, 10))) {
        streak += 1
        cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000)
      }
    }

    // Workouts this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: weeklyWorkouts } = await admin
      .from('workouts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetId)
      .eq('is_template', false)
      .gte('date', weekAgo)

    // Recent PRs from notifications
    const { data: prNotifs } = await admin
      .from('notifications')
      .select('message, metadata, created_at')
      .eq('sender_id', targetId)
      .eq('type', 'friend_pr')
      .order('created_at', { ascending: false })
      .limit(5)

    const recentPRs = (Array.isArray(prNotifs) ? prNotifs : []).map((n) => ({
      message: n.message,
      prs: n.metadata && typeof n.metadata === 'object' ? (n.metadata as Record<string, unknown>).prs : null,
      createdAt: n.created_at,
    }))

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        photoUrl: profile.photo_url,
        role: profile.role,
      },
      stats: {
        totalWorkouts: Number(totalWorkouts || 0),
        streak,
        weeklyWorkouts: Number(weeklyWorkouts || 0),
      },
      recentPRs,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
