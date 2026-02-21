import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { filterRecipientsByPreference, insertNotifications, listFollowerIdsOf, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { createAdminClient } from '@/utils/supabase/admin'
import { isAllowedStoryPath, validateStoryPayload } from '@/lib/social/storyValidation'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({}).strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const validation = validateStoryPayload(body)

    if (!validation.ok || !validation.data) {
      return NextResponse.json({ ok: false, error: validation.error || 'invalid_payload' }, { status: 400 })
    }

    const { mediaPath, caption, meta } = validation.data

    if (!isAllowedStoryPath(auth.user.id, mediaPath)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const { data, error } = await auth.supabase
      .from('social_stories')
      .insert({
        author_id: auth.user.id,
        media_path: mediaPath,
        caption,
        meta,
      })
      .select('id, created_at, expires_at')
      .maybeSingle()

    if (error || !data?.id) return NextResponse.json({ ok: false, error: getErrorMessage(error) || 'failed' }, { status: 400 })

    try {
      const throttled = await shouldThrottleBySenderType(auth.user.id, 'story_posted', 5)
      if (!throttled) {
        const followerIds = await listFollowerIdsOf(auth.user.id)
        const recipients = await filterRecipientsByPreference(followerIds, 'notifySocialFollows')
        if (recipients.length) {
          const admin = createAdminClient()
          const { data: authorProfile } = await admin.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle()
          const authorName = String(authorProfile?.display_name || '').trim() || 'Seu amigo'
          await insertNotifications(
            recipients.map((uid) => ({
              user_id: uid,
              recipient_id: uid,
              sender_id: auth.user.id,
              type: 'story_posted',
              title: 'Novo story',
              message: `${authorName} postou um story.`,
              read: false,
              is_read: false,
              metadata: { author_id: auth.user.id, story_id: data.id },
            }))
          )
        }
      }
    } catch { }
    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
