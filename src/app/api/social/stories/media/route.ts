import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

    const url = new URL(req.url)
    const storyId = String(url.searchParams.get('storyId') || url.searchParams.get('story_id') || '').trim()
    const signedSeconds = Math.min(3600, Math.max(60, Number(url.searchParams.get('signedSeconds') || 600) || 600))
    if (!storyId) return new Response('storyId required', { status: 400 })

    const userId = String(auth.user?.id || '').trim()
    if (!userId) return new Response('unauthorized', { status: 401 })

    const admin = createAdminClient()

    const { data: story, error } = await admin
      .from('social_stories')
      .select('id, author_id, media_path, expires_at, is_deleted')
      .eq('id', storyId)
      .maybeSingle()

    if (error || !story?.media_path) return new Response(error?.message || 'not_found', { status: 404 })
    if (story?.is_deleted) return new Response('not_found', { status: 404 })
    if (story?.expires_at && new Date(String(story.expires_at)).getTime() <= Date.now()) return new Response('not_found', { status: 404 })

    const authorId = String((story as any)?.author_id || '').trim()
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

    const range = req.headers.get('range') || req.headers.get('Range')
    const upstream = await fetch(String(signed.signedUrl), {
      headers: range ? { Range: range } : undefined,
      redirect: 'follow',
    })

    if (!upstream.ok && upstream.status !== 206) {
      const txt = await upstream.text().catch(() => '')
      return new Response(txt || 'upstream_failed', { status: upstream.status || 502 })
    }

    const headers = new Headers()

    const contentType =
      upstream.headers.get('content-type') ||
      guessContentTypeFromPath(String(story.media_path)) ||
      'application/octet-stream'
    headers.set('Content-Type', contentType)

    for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'] as const) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }

    if (!headers.get('accept-ranges')) headers.set('Accept-Ranges', 'bytes')

    headers.set('Content-Disposition', 'inline')

    headers.set('Cache-Control', 'private, max-age=60')

    headers.set('Vary', 'Range')

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (e: any) {
    return new Response(e?.message ?? 'internal_error', { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => ({}))
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    const signedSeconds = Math.min(3600, Math.max(60, Number(body?.signedSeconds || 600) || 600))
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const { data: story, error } = await auth.supabase
      .from('social_stories')
      .select('id, media_path')
      .eq('id', storyId)
      .maybeSingle()

    if (error || !story?.media_path) return NextResponse.json({ ok: false, error: error?.message || 'not_found' }, { status: 404 })

    const admin = createAdminClient()
    const bucket = 'social-stories'
    const { data, error: sErr } = await admin.storage.from(bucket).createSignedUrl(String(story.media_path), signedSeconds)
    if (sErr || !data?.signedUrl) return NextResponse.json({ ok: false, error: sErr?.message || 'failed' }, { status: 400 })

    return NextResponse.json({ ok: true, url: data.signedUrl })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
