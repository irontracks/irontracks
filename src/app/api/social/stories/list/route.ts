import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseSearchParams } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheGet, cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

type StoryRow = {
  id: string
  author_id: string
  media_path: string
  created_at: string
  expires_at: string
  caption: string | null
}

type StoryGroup = {
  authorId: string
  displayName: string | null
  photoUrl: string | null
  role: string | null
  stories: Array<Record<string, unknown>>
}

const mediaKindFromPath = (path: string): 'image' | 'video' => {
  const p = String(path || '').toLowerCase()
  if (p.endsWith('.mp4') || p.endsWith('.mov') || p.endsWith('.webm')) return 'video'
  return 'image'
}

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(300).default(200),
  signedSeconds: z.coerce.number().int().min(60).max(3600).default(600),
})

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:list:${auth.user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const limit = q?.limit ?? 200
    const signedSeconds = q?.signedSeconds ?? 600

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const cacheKey = `social:stories:list:${userId}:${limit}:${signedSeconds}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null))
    if (cached) return NextResponse.json(cached)

    const admin = createAdminClient()

    const { data: follows, error: fErr } = await auth.supabase
      .from('social_follows')
      .select('following_id, status')
      .eq('follower_id', userId)
      .eq('status', 'accepted')

    if (fErr) return NextResponse.json({ ok: false, error: fErr.message }, { status: 400 })

    const followingIds = (Array.isArray(follows) ? follows : [])
      .map((r: unknown) => String(asRecord(r)?.following_id || '').trim())
      .filter(Boolean)
    const authorIds = Array.from(new Set([userId, ...followingIds]))
    if (!authorIds.length) return NextResponse.json({ ok: true, data: [] })

    const { data: storiesRaw, error: sErr } = await admin
      .from('social_stories')
      .select('id, author_id, media_path, created_at, expires_at, caption')
      .in('author_id', authorIds)
      .eq('is_deleted', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(limit)

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })
    const stories: StoryRow[] = (Array.isArray(storiesRaw) ? storiesRaw : [])
      .map((row: unknown) => {
        const r = asRecord(row)
        return {
          id: String(r.id || '').trim(),
          author_id: String(r.author_id || '').trim(),
          media_path: String(r.media_path || ''),
          created_at: String(r.created_at || ''),
          expires_at: String(r.expires_at || ''),
          caption: r.caption == null ? null : String(r.caption),
        }
      })
      .filter((s) => Boolean(s.id && s.author_id))
    const storyIds = stories.map((s) => s.id).filter(Boolean)

    const viewedSet = new Set<string>()
    if (storyIds.length) {
      const { data: viewsRaw } = await admin.from('social_story_views').select('story_id').eq('viewer_id', userId).in('story_id', storyIds)
      for (const r of Array.isArray(viewsRaw) ? viewsRaw : []) {
        const sid = String(asRecord(r)?.story_id || '').trim()
        if (sid) viewedSet.add(sid)
      }
    }

    const likeCountByStory = new Map<string, number>()
    const likedSet = new Set<string>()
    if (storyIds.length) {
      const { data: likesRaw } = await admin.from('social_story_likes').select('story_id, user_id').in('story_id', storyIds)
      const likes = Array.isArray(likesRaw) ? likesRaw : []
      for (const r of likes as unknown[]) {
        const row = asRecord(r)
        const sid = String(row?.story_id || '').trim()
        const uid = String(row?.user_id || '').trim()
        if (!sid) continue
        likeCountByStory.set(sid, (likeCountByStory.get(sid) || 0) + 1)
        if (uid && uid === userId) likedSet.add(sid)
      }
    }

    const commentCountByStory = new Map<string, number>()
    if (storyIds.length) {
      const { data: commentsRaw } = await admin.from('social_story_comments').select('story_id').in('story_id', storyIds)
      const comments = Array.isArray(commentsRaw) ? commentsRaw : []
      for (const r of comments as unknown[]) {
        const sid = String(asRecord(r)?.story_id || '').trim()
        if (!sid) continue
        commentCountByStory.set(sid, (commentCountByStory.get(sid) || 0) + 1)
      }
    }

    const { data: profilesRaw } = await admin
      .from('profiles')
      .select('id, display_name, photo_url, role')
      .in('id', authorIds)
    const profilesArr = Array.isArray(profilesRaw) ? profilesRaw : []
    const profileById = new Map<string, Record<string, unknown>>()
    for (const p of profilesArr as unknown[]) {
      const row = asRecord(p)
      const id = String(row?.id || '').trim()
      if (!id) continue
      profileById.set(id, row)
    }

    const byAuthor = new Map<string, StoryGroup>()
    for (const authorId of authorIds) {
      const p = profileById.get(authorId) || null
      byAuthor.set(authorId, {
        authorId,
        displayName: p?.display_name != null ? String(p.display_name) : null,
        photoUrl: p?.photo_url != null ? String(p.photo_url) : null,
        role: p?.role != null ? String(p.role) : null,
        stories: [],
      })
    }

    for (const s of stories) {
      const authorId = String(s.author_id || '').trim()
      if (!authorId || !byAuthor.has(authorId)) continue
      const group = byAuthor.get(authorId)
      if (!group) continue
      group.stories.push({
        id: s.id,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        caption: s.caption ?? null,
        mediaUrl: `/api/social/stories/media?storyId=${encodeURIComponent(String(s.id))}&signedSeconds=${encodeURIComponent(String(signedSeconds))}`,
        mediaKind: mediaKindFromPath(s.media_path),
        viewed: viewedSet.has(s.id),
        likeCount: likeCountByStory.get(s.id) || 0,
        hasLiked: likedSet.has(s.id),
        commentCount: commentCountByStory.get(s.id) || 0,
      })
    }

    const groups = Array.from(byAuthor.values())
      .map((g) => {
        const storiesArr = Array.isArray(g.stories) ? g.stories : []
        return {
          ...g,
          hasStories: storiesArr.length > 0,
          hasUnseen: storiesArr.some((st: Record<string, unknown>) => st.viewed !== true),
          latestAt: storiesArr.length ? String(storiesArr[0]?.createdAt || '') : '',
        }
      })
      .filter((g) => g.authorId === userId || g.hasStories)
      .sort((a, b) => {
        if (a.authorId === userId) return -1
        if (b.authorId === userId) return 1
        if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1
        if (a.hasStories !== b.hasStories) return a.hasStories ? -1 : 1
        return String(b.latestAt).localeCompare(String(a.latestAt))
      })

    const payload = { ok: true, data: groups }
    await cacheSet(cacheKey, payload, 30)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
