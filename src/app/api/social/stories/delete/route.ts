import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    storyId: z.string().optional(),
    story_id: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const storyId = String(body?.storyId || body?.story_id || '').trim()
    if (!storyId) return NextResponse.json({ ok: false, error: 'story_id required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: story, error: sErr } = await admin
      .from('social_stories')
      .select('*')
      .eq('id', storyId)
      .maybeSingle()

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 })
    if (!story?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const authorId = String(story.author_id || '').trim()
    if (!authorId || authorId !== String(auth.user.id || '').trim()) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const mediaPath = String(story.media_path || '').trim()
    const { data: likes } = await admin.from('social_story_likes').select('*').eq('story_id', storyId).limit(2000)
    const { data: comments } = await admin.from('social_story_comments').select('*').eq('story_id', storyId).limit(2000)
    const { data: views } = await admin.from('social_story_views').select('*').eq('story_id', storyId).limit(2000)

    await admin.from('soft_delete_bin').insert({
      deleted_by: auth.user.id,
      delete_reason: 'user_manual_delete',
      entity_type: 'social_story',
      entity_id: storyId,
      payload: { story, likes: likes || [], comments: comments || [], views: views || [] },
      media_paths: mediaPath ? [mediaPath] : [],
    })

    await admin.from('audit_events').insert({
      actor_id: auth.user.id,
      actor_email: String(auth.user.email || '').trim() || null,
      actor_role: 'user',
      action: 'social_story_delete',
      entity_type: 'social_story',
      entity_id: storyId,
      metadata: { mediaPath: mediaPath || null },
    })

    if (mediaPath) {
      try {
        await admin.storage.from('social-stories').remove([mediaPath])
      } catch {}
    }

    await admin.from('social_story_views').delete().eq('story_id', storyId)
    await admin.from('social_story_likes').delete().eq('story_id', storyId)
    await admin.from('social_story_comments').delete().eq('story_id', storyId)

    const { error: dErr } = await admin.from('social_stories').delete().eq('id', storyId)
    if (dErr) return NextResponse.json({ ok: false, error: dErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
