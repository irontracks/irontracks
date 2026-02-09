import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

type StoryRow = {
  id: string
  author_id: string
  media_path: string
  created_at: string
  expires_at: string
  caption: string | null
}

const mediaKindFromPath = (path: string): 'image' | 'video' => {
  const p = String(path || '').toLowerCase()
  if (p.endsWith('.mp4') || p.endsWith('.mov') || p.endsWith('.webm')) return 'video'
  return 'image'
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit') || 200) || 200))
    const signedSeconds = Math.min(3600, Math.max(60, Number(url.searchParams.get('signedSeconds') || 600) || 600))

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: follows, error: fErr } = await auth.supabase
      .from('social_follows')
      .select('following_id, status')
      .eq('follower_id', userId)
      .eq('status', 'accepted')

    if (fErr) return NextResponse.json({ ok: false, error: fErr.message }, { status: 400 })

    const followingIds = (Array.isArray(follows) ? follows : []).map((r: any) => String(r?.following_id || '').trim()).filter(Boolean)
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
    const stories = (Array.isArray(storiesRaw) ? (storiesRaw as any[]) : []) as StoryRow[]
    const storyIds = stories.map((s) => s.id).filter(Boolean)

    const viewedSet = new Set<string>()
    if (storyIds.length) {
      const { data: viewsRaw } = await admin.from('social_story_views').select('story_id').eq('viewer_id', userId).in('story_id', storyIds)
      for (const r of Array.isArray(viewsRaw) ? (viewsRaw as any[]) : []) {
        const sid = String((r as any)?.story_id || '').trim()
        if (sid) viewedSet.add(sid)
      }
    }

    const likeCountByStory = new Map<string, number>()
    const likedSet = new Set<string>()
    if (storyIds.length) {
      const { data: likesRaw } = await admin.from('social_story_likes').select('story_id, user_id').in('story_id', storyIds)
      const likes = Array.isArray(likesRaw) ? likesRaw : []
      for (const r of likes as any[]) {
        const sid = String(r?.story_id || '').trim()
        const uid = String(r?.user_id || '').trim()
        if (!sid) continue
        likeCountByStory.set(sid, (likeCountByStory.get(sid) || 0) + 1)
        if (uid && uid === userId) likedSet.add(sid)
      }
    }

    const commentCountByStory = new Map<string, number>()
    if (storyIds.length) {
      const { data: commentsRaw } = await admin.from('social_story_comments').select('story_id').in('story_id', storyIds)
      const comments = Array.isArray(commentsRaw) ? commentsRaw : []
      for (const r of comments as any[]) {
        const sid = String(r?.story_id || '').trim()
        if (!sid) continue
        commentCountByStory.set(sid, (commentCountByStory.get(sid) || 0) + 1)
      }
    }

    const { data: profilesRaw } = await admin
      .from('profiles')
      .select('id, display_name, photo_url, role')
      .in('id', authorIds)
    const profilesArr = Array.isArray(profilesRaw) ? profilesRaw : []
    const profileById = new Map<string, any>()
    for (const p of profilesArr as any[]) {
      const id = String(p?.id || '').trim()
      if (!id) continue
      profileById.set(id, p)
    }

    const byAuthor = new Map<string, any>()
    for (const authorId of authorIds) {
      const p = profileById.get(authorId) || null
      byAuthor.set(authorId, {
        authorId,
        displayName: p?.display_name ?? null,
        photoUrl: p?.photo_url ?? null,
        role: p?.role ?? null,
        stories: [],
      })
    }

    for (const s of stories) {
      const authorId = String(s.author_id || '').trim()
      if (!authorId || !byAuthor.has(authorId)) continue
      byAuthor.get(authorId).stories.push({
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
          hasUnseen: storiesArr.some((st: any) => !st.viewed),
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

    return NextResponse.json({ ok: true, data: groups })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
