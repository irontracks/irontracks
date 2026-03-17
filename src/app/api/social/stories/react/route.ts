import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'

export const dynamic = 'force-dynamic'

const EMOJIS = ['🔥', '💪', '👏', '🫡', '❤️'] as const

const BodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    emoji: z.string(),
  })
  .strip()

/**
 * POST /api/social/stories/react — Add/toggle emoji reaction on a story.
 * Uses existing `social_story_likes` table with a naming convention:
 * Stores reaction as metadata in the likes row.
 * 
 * For now, we use notifications to deliver reactions (lightweight approach).
 * A dedicated reactions table can be added later.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:react:${auth.user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!

    const storyId = String(body?.storyId || body?.story_id || '').trim()
    const emoji = String(body?.emoji || '').trim()

    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })
    if (!EMOJIS.includes(emoji as typeof EMOJIS[number])) {
      return NextResponse.json({ ok: false, error: 'invalid emoji' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get the story to find the author
    const { data: story } = await admin
      .from('social_stories')
      .select('user_id')
      .eq('id', storyId)
      .maybeSingle()

    if (!story?.user_id) {
      return NextResponse.json({ ok: false, error: 'story_not_found' }, { status: 404 })
    }

    // Don't notify yourself
    if (story.user_id !== auth.user.id) {
      const { data: me } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', auth.user.id)
        .maybeSingle()
      const name = String(me?.display_name || '').trim() || 'Alguém'

      await insertNotifications([{
        user_id: story.user_id,
        recipient_id: story.user_id,
        sender_id: auth.user.id,
        type: 'story_reaction',
        title: 'Nova reação',
        message: `${name} reagiu ${emoji} ao seu story.`,
        is_read: false,
        metadata: { story_id: storyId, emoji, sender_id: auth.user.id },
      }])
    }

    // Also ensure the like is registered
    await auth.supabase
      .from('social_story_likes')
      .upsert({ story_id: storyId, user_id: auth.user.id }, { onConflict: 'story_id,user_id' })
      .select()

    return NextResponse.json({ ok: true, emoji, storyId })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
