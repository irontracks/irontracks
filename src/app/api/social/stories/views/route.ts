import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseSearchParams } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  story_id: z.string().uuid('story_id inválido'),
})

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const storyId = String(q?.story_id || '').trim()
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: story, error: sErr } = await admin
      .from('social_stories')
      .select('id, author_id, is_deleted, expires_at')
      .eq('id', storyId)
      .maybeSingle()
    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })
    if (!story?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const authorId = String(story.author_id || '').trim()
    if (!authorId || authorId !== userId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const { data: viewsRaw, error: vErr } = await admin
      .from('social_story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false })
      .limit(1000)
    if (vErr) return NextResponse.json({ ok: false, error: vErr.message }, { status: 400 })

    const views = Array.isArray(viewsRaw) ? viewsRaw : []
    const viewerIds = views.map((r: Record<string, unknown>) => String(r?.viewer_id || '').trim()).filter(Boolean)

    const profileById = new Map<string, any>()
    if (viewerIds.length) {
      const { data: profilesRaw } = await admin
        .from('profiles')
        .select('id, display_name, photo_url, role')
        .in('id', viewerIds)
        .limit(2000)
      for (const p of Array.isArray(profilesRaw) ? (profilesRaw as Record<string, unknown>[]) : []) {
        const id = String(p?.id || '').trim()
        if (!id) continue
        profileById.set(id, p)
      }
    }

    return NextResponse.json({
      ok: true,
      data: views
        .map((r: Record<string, unknown>) => {
          const id = String(r?.viewer_id || '').trim()
          if (!id) return null
          const prof = profileById.get(id) || null
          return {
            viewerId: id,
            viewedAt: r?.viewed_at ? String(r.viewed_at) : null,
            displayName: prof?.display_name ?? null,
            photoUrl: prof?.photo_url ?? null,
            role: prof?.role ?? null,
          }
        })
        .filter(Boolean),
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
