import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheDeletePattern } from '@/utils/cache'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:delete:${auth.user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const admin = createAdminClient()

    // ---- Primary: soft-delete via is_deleted flag (matches list API filter) ----
    // Only allow the author to soft-delete their own stories
    const { data: updated, error: updErr } = await admin
      .from('social_stories')
      .update({ is_deleted: true })
      .eq('id', storyId)
      .eq('author_id', auth.user.id)
      .select('id, media_path')
      .maybeSingle()

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 })
    }

    // Fallback: if soft-delete didn't match (is_deleted column might not exist or
    // the row was already hard-deleted), try a hard DELETE as last resort
    if (!updated?.id) {
      const { error: hardErr, count } = await admin
        .from('social_stories')
        .delete({ count: 'exact' })
        .eq('id', storyId)
        .eq('author_id', auth.user.id)

      if (hardErr) {
        return NextResponse.json({ ok: false, error: hardErr.message }, { status: 400 })
      }
      if (!count || count === 0) {
        return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
      }
    }

    // Best-effort cleanup — none of these should block success
    const mediaPath = String(updated?.media_path || '').trim()
    if (mediaPath) {
      try { await admin.storage.from('social-stories').remove([mediaPath]) } catch (e) { logError('api:social:stories:delete:remove-media', e) }
    }
    try { await admin.from('social_story_views').delete().eq('story_id', storyId) } catch (e) { logError('api:social:stories:delete:views', e) }
    try { await admin.from('social_story_likes').delete().eq('story_id', storyId) } catch (e) { logError('api:social:stories:delete:likes', e) }
    try { await admin.from('social_story_comments').delete().eq('story_id', storyId) } catch (e) { logError('api:social:stories:delete:comments', e) }

    // Invalidate stories list cache for all users so the deleted story
    // disappears immediately on next load (cache TTL is 120s)
    try { await cacheDeletePattern('social:stories:list:*') } catch (e) { logError('api:social:stories:delete:cache-invalidate', e) }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}
