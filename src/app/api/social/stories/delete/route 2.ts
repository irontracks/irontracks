import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => ({}))
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: story, error: sErr } = await admin
      .from('social_stories')
      .select('id, author_id, media_path')
      .eq('id', storyId)
      .maybeSingle()

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })
    if (!story?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const authorId = String(story.author_id || '').trim()
    if (!authorId || authorId !== String(auth.user.id || '').trim()) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const mediaPath = String(story.media_path || '').trim()
    const { error: uErr } = await admin.from('social_stories').update({ is_deleted: true }).eq('id', storyId)
    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 400 })

    if (mediaPath) {
      try {
        await admin.storage.from('social-stories').remove([mediaPath])
      } catch {}
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
