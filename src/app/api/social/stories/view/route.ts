import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => ({}))
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const { error } = await auth.supabase
      .from('social_story_views')
      .upsert({ story_id: storyId, viewer_id: auth.user.id }, { onConflict: 'story_id,viewer_id' })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

