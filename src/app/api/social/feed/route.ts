import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/social/feed — Activity feed from people I follow.
 * Reads the `notifications` table for events where sender_id is someone I follow.
 * Also returns events directed at me (workout_finish, friend_pr, etc.).
 * Query params: ?cursor=<created_at ISO>&limit=20
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:feed:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const url = new URL(req.url)
    const cursor = url.searchParams.get('cursor') || null
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))

    const admin = createAdminClient()

    // Get who I follow (accepted only)
    const { data: followRows } = await admin
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', userId)
      .eq('status', 'accepted')
      .limit(500)

    const followingIds = (Array.isArray(followRows) ? followRows : [])
      .map((r) => String(r?.following_id || '').trim())
      .filter(Boolean)

    if (!followingIds.length) {
      return NextResponse.json({ ok: true, items: [], nextCursor: null })
    }

    // Feed event types we care about
    const feedTypes = [
      'workout_start',
      'workout_finish',
      'friend_pr',
      'friend_streak',
      'friend_goal',
      'story_like',
      'story_reaction',
      'friend_online',
      'challenge_created',
      'challenge_accepted',
    ]

    // Query notifications sent BY people I follow
    let query = admin
      .from('notifications')
      .select('id, type, title, message, sender_id, metadata, created_at')
      .in('sender_id', followingIds)
      .in('type', feedTypes)
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: rows, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const rawItems = Array.isArray(rows) ? rows : []

    // Deduplicate: same sender + same type within 5 min window → keep latest
    const deduped: typeof rawItems = []
    const seen = new Set<string>()
    for (const item of rawItems) {
      const ts = new Date(String(item.created_at)).getTime()
      const bucket = Math.floor(ts / (5 * 60 * 1000)) // 5 min bucket
      const key = `${item.sender_id}:${item.type}:${bucket}`
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
    }

    const items = deduped.slice(0, limit)
    const hasMore = deduped.length > limit
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null

    // Collect unique sender IDs for profile info
    const senderIds = [...new Set(items.map((i) => String(i.sender_id || '').trim()).filter(Boolean))]

    // Fetch profiles
    const profileMap = new Map<string, { display_name: string | null; photo_url: string | null; role: string | null }>()
    if (senderIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, display_name, photo_url, role')
        .in('id', senderIds)
        .limit(500)

      if (Array.isArray(profiles)) {
        for (const p of profiles) {
          profileMap.set(String(p.id), {
            display_name: p.display_name ? String(p.display_name) : null,
            photo_url: p.photo_url ? String(p.photo_url) : null,
            role: p.role ? String(p.role) : null,
          })
        }
      }
    }

    // Enrich items with sender profile
    const enriched = items.map((item) => {
      const profile = profileMap.get(String(item.sender_id || '')) || null
      return {
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        senderId: item.sender_id,
        senderName: profile?.display_name || null,
        senderPhoto: profile?.photo_url || null,
        senderRole: profile?.role || null,
        metadata: item.metadata,
        createdAt: item.created_at,
      }
    })

    return NextResponse.json({ ok: true, items: enriched, nextCursor })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
