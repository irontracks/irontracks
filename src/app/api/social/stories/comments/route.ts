import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const PostBodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
    body: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough()

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const storyId = String(url.searchParams.get('storyId') || url.searchParams.get('story_id') || '').trim()
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50))
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: commentsRaw, error } = await admin
      .from('social_story_comments')
      .select('id, story_id, user_id, body, created_at')
      .eq('story_id', storyId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    const comments = Array.isArray(commentsRaw) ? commentsRaw : []
    const userIds = Array.from(new Set(comments.map((c: any) => String(c?.user_id || '').trim()).filter(Boolean)))
    const { data: profilesRaw } = userIds.length
      ? await admin.from('profiles').select('id, display_name, photo_url').in('id', userIds)
      : { data: [] as any[] }
    const profileById = new Map<string, any>()
    for (const p of Array.isArray(profilesRaw) ? (profilesRaw as any[]) : []) {
      const id = String(p?.id || '').trim()
      if (!id) continue
      profileById.set(id, p)
    }

    return NextResponse.json({
      ok: true,
      data: comments.map((c: any) => {
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
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

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

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
