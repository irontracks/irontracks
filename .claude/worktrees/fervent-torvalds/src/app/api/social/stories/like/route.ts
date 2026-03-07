import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    like: z.boolean().optional(),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

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
    return NextResponse.json({ ok: true, liked: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
