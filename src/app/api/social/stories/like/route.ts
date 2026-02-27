import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheSetNx } from '@/utils/cache'
import { createAdminClient } from '@/utils/supabase/admin'
import { insertNotifications } from '@/lib/social/notifyFollowers'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    like: z.boolean().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:like:${auth.user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    const like = body?.like
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const shouldLike = typeof like === 'boolean' ? like : null
    if (shouldLike === true) {
      const { error } = await auth.supabase.from('social_story_likes').insert({ story_id: storyId, user_id: auth.user.id })
      if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      try {
        const isNew = await cacheSetNx(`social:like:push:${storyId}:${auth.user.id}`, '1', 300)
        if (isNew) {
          const admin = createAdminClient()
          const { data: story } = await admin.from('social_stories').select('user_id').eq('id', storyId).maybeSingle()

          if (story?.user_id && story.user_id !== auth.user.id) {
            const { data: me } = await admin.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle()
            const name = String(me?.display_name || '').trim() || 'Alguém'

            await insertNotifications([{
              user_id: story.user_id,
              recipient_id: story.user_id,
              sender_id: auth.user.id,
              type: 'story_like',
              title: 'Nova curtida',
              message: `${name} curtiu seu story.`,
              read: false,
              is_read: false,
              metadata: { story_id: storyId, sender_id: auth.user.id },
            }])
          }
        }
      } catch { }

      return NextResponse.json({ ok: true, liked: true })
    }
    if (shouldLike === false) {
      const { error } = await auth.supabase.from('social_story_likes').delete().eq('story_id', storyId).eq('user_id', auth.user.id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, liked: false })
    }

    const { data: existing } = await auth.supabase
      .from('social_story_likes')
      .select('story_id')
      .eq('story_id', storyId)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (existing?.story_id) {
      const { error } = await auth.supabase.from('social_story_likes').delete().eq('story_id', storyId).eq('user_id', auth.user.id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, liked: false })
    }

    const { error } = await auth.supabase.from('social_story_likes').insert({ story_id: storyId, user_id: auth.user.id })
    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    try {
      const isNew = await cacheSetNx(`social:like:push:${storyId}:${auth.user.id}`, '1', 300)
      if (isNew) {
        const admin = createAdminClient()
        const { data: story } = await admin.from('social_stories').select('user_id').eq('id', storyId).maybeSingle()

        if (story?.user_id && story.user_id !== auth.user.id) {
          const { data: me } = await admin.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle()
          const name = String(me?.display_name || '').trim() || 'Alguém'

          await insertNotifications([{
            user_id: story.user_id,
            recipient_id: story.user_id,
            sender_id: auth.user.id,
            type: 'story_like',
            title: 'Nova curtida',
            message: `${name} curtiu seu story.`,
            read: false,
            is_read: false,
            metadata: { story_id: storyId, sender_id: auth.user.id },
          }])
        }
      }
    } catch { }

    return NextResponse.json({ ok: true, liked: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
