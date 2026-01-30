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

