import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheGet, cacheSet } from '@/utils/cache'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { extractMentions } from '@/lib/social/extractMentions'
import { logError } from '@/lib/logger'
import { waitUntil } from '@vercel/functions'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

const PostBodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    body: z.string().optional(),
    text: z.string().optional(),
  })
  .strip()

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:comments:list:${auth.user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const url = new URL(req.url)
    const storyId = String(url.searchParams.get('storyId') || url.searchParams.get('story_id') || '').trim()
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50))
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Security: verify follow relationship before exposing comments
    const { data: story } = await admin
      .from('social_stories')
      .select('author_id')
      .eq('id', storyId)
      .maybeSingle()
    const authorId = String(story?.author_id || '').trim()
    if (authorId && authorId !== auth.user.id) {
      const { data: follow } = await admin
        .from('social_follows')
        .select('id')
        .eq('follower_id', auth.user.id)
        .eq('following_id', authorId)
        .eq('status', 'accepted')
        .maybeSingle()
      if (!follow) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const cacheKey = `social:stories:comments:${auth.user.id}:${storyId}:${limit}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const { data: commentsRaw, error } = await admin
      .from('social_story_comments')
      .select('id, story_id, user_id, body, created_at')
      .eq('story_id', storyId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) return respondDbError('social:stories:comments:list', error)
    const comments = Array.isArray(commentsRaw) ? commentsRaw : []
    const userIds = Array.from(new Set(comments.map((c: Record<string, unknown>) => String(c?.user_id || '').trim()).filter(Boolean)))
    const { data: profilesRaw } = userIds.length
      ? await admin.from('profiles').select('id, display_name, photo_url').in('id', userIds)
      : { data: [] as unknown[] }
    const profileById = new Map<string, Record<string, unknown>>()
    for (const p of Array.isArray(profilesRaw) ? (profilesRaw as Record<string, unknown>[]) : []) {
      const id = String(p?.id || '').trim()
      if (!id) continue
      profileById.set(id, p)
    }

    const payload = {
      ok: true,
      data: comments.map((c: Record<string, unknown>) => {
        const uid = String(c?.user_id || '').trim()
        const p = uid ? profileById.get(uid) : null
        return {
          id: c?.id ?? null,
          storyId: c?.story_id ?? null,
          userId: uid || null,
          body: c?.body ?? '',
          createdAt: c?.created_at ?? null,
          user: p
            ? { id: uid, displayName: p?.display_name ?? null, photoUrl: p?.photo_url ?? null }
            : { id: uid, displayName: null, photoUrl: null },
        }
      }),
    }
    await cacheSet(cacheKey, payload, 20)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:comments:create:${auth.user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, PostBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    const text = String(body?.body || body?.text || '').trim()
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })
    if (!text) return NextResponse.json({ ok: false, error: 'body required' }, { status: 400 })
    if (text.length > 500) return NextResponse.json({ ok: false, error: 'body too long' }, { status: 400 })

    const { data, error } = await auth.supabase
      .from('social_story_comments')
      .insert({ story_id: storyId, user_id: auth.user.id, body: text })
      .select('id, story_id, user_id, body, created_at')
      .maybeSingle()

    if (error) return respondDbError('social:stories:comments:create', error)

    // Fire-and-forget: notify the story author (1→1) and any @mentioned users.
    waitUntil(
      (async () => {
        try {
          const admin = createAdminClient()
          const [{ data: story }, { data: me }, mentions] = await Promise.all([
            admin.from('social_stories').select('author_id').eq('id', storyId).maybeSingle(),
            admin.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle(),
            extractMentions(text),
          ])
          const authorId = String(story?.author_id || '').trim()
          const senderName = String(me?.display_name || '').trim() || 'Alguém'
          const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text

          // Mentioned users — exclude the commenter themselves and the story
          // author (the author already gets the story_comment notification).
          const mentionedIds = Object.values(mentions.userIdsByHandle).filter(
            (id) => id && id !== auth.user.id && id !== authorId,
          )

          const rows: Array<Record<string, unknown>> = []

          if (authorId && authorId !== auth.user.id) {
            rows.push({
              user_id: authorId,
              recipient_id: authorId,
              sender_id: auth.user.id,
              type: 'story_comment',
              title: 'Novo comentário no seu story',
              message: `${senderName}: ${preview}`,
              is_read: false,
              metadata: { story_id: storyId, comment_id: data?.id ?? null, sender_id: auth.user.id },
            })
          }

          for (const mid of mentionedIds) {
            rows.push({
              user_id: mid,
              recipient_id: mid,
              sender_id: auth.user.id,
              type: 'mentioned_in_comment',
              title: 'Você foi mencionado',
              message: `${senderName} te mencionou: ${preview}`,
              is_read: false,
              metadata: { story_id: storyId, comment_id: data?.id ?? null, sender_id: auth.user.id },
            })
          }

          if (rows.length) await insertNotifications(rows)
        } catch (e) {
          logError('story-comment.notify', e)
        }
      })(),
    )

    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}
