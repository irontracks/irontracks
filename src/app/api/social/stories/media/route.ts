import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PostBodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    signedSeconds: z.coerce.number().optional(),
  })
  .strip()

const guessContentTypeFromPath = (path: string) => {
  const p = String(path || '').toLowerCase()
  if (p.endsWith('.mp4')) return 'video/mp4'
  if (p.endsWith('.mov')) return 'video/quicktime'
  if (p.endsWith('.webm')) return 'video/webm'
  if (p.endsWith('.png')) return 'image/png'
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg'
  return ''
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:media:get:${auth.user.id}:${ip}`, 120, 60_000)
    if (!rl.allowed) return new Response('rate_limited', { status: 429 })

    const url = new URL(req.url)
    const storyId = String(url.searchParams.get('storyId') || url.searchParams.get('story_id') || '').trim()
    const signedSeconds = Math.min(3600, Math.max(60, Number(url.searchParams.get('signedSeconds') || 600) || 600))
    if (!storyId) return new Response('storyId required', { status: 400 })

    const userId = String(auth.user?.id || '').trim()
    if (!userId) return new Response('unauthorized', { status: 401 })

    const cacheKey = `social:stories:media:${userId}:${storyId}:${signedSeconds}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached?.redirectUrl) {
      const headers = new Headers()
      headers.set('Location', String(cached.redirectUrl))
      headers.set('Cache-Control', 'private, max-age=600, stale-while-revalidate=600')
      headers.set('Content-Type', String(cached.contentType || 'application/octet-stream'))
      return new Response(null, { status: 307, headers })
    }

    const admin = createAdminClient()

    const { data: story, error } = await admin
      .from('social_stories')
      .select('id, author_id, media_path, expires_at, is_deleted')
      .eq('id', storyId)
      .maybeSingle()

    if (error || !story?.media_path) return new Response(getErrorMessage(error) || 'not_found', { status: 404 })
    if (story?.is_deleted) return new Response('not_found', { status: 404 })
    if (story?.expires_at && new Date(String(story.expires_at)).getTime() <= Date.now()) return new Response('not_found', { status: 404 })

    const authorId = String((story as Record<string, unknown>)?.author_id || '').trim()
    if (!authorId) return new Response('not_found', { status: 404 })
    if (authorId !== userId) {
      const { data: follow, error: fErr } = await admin
        .from('social_follows')
        .select('id')
        .eq('follower_id', userId)
        .eq('following_id', authorId)
        .eq('status', 'accepted')
        .maybeSingle()
      if (fErr || !follow) return new Response('forbidden', { status: 403 })
    }

    const bucket = 'social-stories'
    const { data: signed, error: sErr } = await admin.storage.from(bucket).createSignedUrl(String(story.media_path), signedSeconds)
    if (sErr || !signed?.signedUrl) return new Response(sErr?.message || 'failed_to_sign', { status: 400 })

    const headers = new Headers()
    headers.set('Location', String(signed.signedUrl))
    headers.set('Cache-Control', 'private, max-age=600, stale-while-revalidate=600')
    headers.set('Content-Type', guessContentTypeFromPath(String(story.media_path)) || 'application/octet-stream')
    await cacheSet(cacheKey, { redirectUrl: String(signed.signedUrl), contentType: headers.get('Content-Type') }, 30)
    return new Response(null, { status: 307, headers })
  } catch (e: unknown) {
    return new Response(getErrorMessage(e) ?? 'internal_error', { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:media:post:${auth.user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, PostBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    const signedSeconds = Math.min(3600, Math.max(60, Number(body?.signedSeconds || 600) || 600))
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const { data: story, error } = await auth.supabase
      .from('social_stories')
      .select('id, media_path')
      .eq('id', storyId)
      .maybeSingle()

    if (error || !story?.media_path) return NextResponse.json({ ok: false, error: getErrorMessage(error) || 'not_found' }, { status: 404 })

    const admin = createAdminClient()
    const bucket = 'social-stories'
    const { data, error: sErr } = await admin.storage.from(bucket).createSignedUrl(String(story.media_path), signedSeconds)
    if (sErr || !data?.signedUrl) return NextResponse.json({ ok: false, error: sErr?.message || 'failed' }, { status: 400 })

    return NextResponse.json({ ok: true, url: data.signedUrl })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
