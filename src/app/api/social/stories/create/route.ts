import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { filterRecipientsByPreference, insertNotifications, listFollowerIdsOf, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { createAdminClient } from '@/utils/supabase/admin'
import { isAllowedStoryPath, validateStoryPayload } from '@/lib/social/storyValidation'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'
const BodySchema = z.unknown()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:stories:create:${auth.user.id}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: unknown = parsedBody.data

    let validation = validateStoryPayload(body)

    if (!validation.ok && String(validation.error || '') === 'media_path required') {
      try {
        const url = new URL(req.url)
        const qp =
          String(url.searchParams.get('mediaPath') || '').trim() ||
          String(url.searchParams.get('media_path') || '').trim()
        if (qp) {
          const baseObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
          validation = validateStoryPayload({ ...baseObj, mediaPath: qp, media_path: qp })
        }
      } catch {
      }
    }

    if (!validation.ok || !validation.data) {
      return NextResponse.json({ ok: false, error: validation.error || 'invalid_payload' }, { status: 400 })
    }

    const { mediaPath, caption, meta } = validation.data

    if (!isAllowedStoryPath(auth.user.id, mediaPath)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const ALLOWED_MIME_PREFIXES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/webm',
    ]
    const mimeAdmin = createAdminClient()
    const pathParts = mediaPath.split('/')
    const fileName = pathParts.at(-1) ?? ''
    const folderPath = pathParts.slice(0, -1).join('/')
    // Timeout the storage list — if metadata isn't ready yet (e.g. just uploaded), skip MIME check
    const listResult = await Promise.race([
      mimeAdmin.storage.from('social-stories').list(folderPath, { search: fileName, limit: 1 }),
      new Promise<{ data: null; error: null }>((resolve) => setTimeout(() => resolve({ data: null, error: null }), 8_000)),
    ])
    const storageMime = String(listResult.data?.[0]?.metadata?.mimetype || '').toLowerCase()
    // Only block if we got a MIME and it's explicitly disallowed; skip check if list timed out / returned empty
    if (storageMime && !ALLOWED_MIME_PREFIXES.some((m) => storageMime.startsWith(m))) {
      return NextResponse.json({ ok: false, error: 'Tipo de arquivo não permitido.' }, { status: 400 })
    }

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

    // Fire-and-forget notifications — must not block the response
    const storyId = data.id
    const authorId = auth.user.id
    void Promise.race([
      (async () => {
        const throttled = await shouldThrottleBySenderType(authorId, 'story_posted', 5)
        if (!throttled) {
          const followerIds = await listFollowerIdsOf(authorId)
          const recipients = await filterRecipientsByPreference(followerIds, 'notifySocialFollows')
          if (recipients.length) {
            const admin = createAdminClient()
            const { data: authorProfile } = await admin.from('profiles').select('display_name').eq('id', authorId).maybeSingle()
            const authorName = String(authorProfile?.display_name || '').trim() || 'Seu amigo'
            await insertNotifications(
              recipients.map((uid) => ({
                user_id: uid,
                recipient_id: uid,
                sender_id: authorId,
                type: 'story_posted',
                title: 'Novo story',
                message: `${authorName} postou um story.`,
                read: false,
                is_read: false,
                metadata: { author_id: authorId, story_id: storyId },
              }))
            )
          }
        }
      })(),
      // Hard cap: notifications must finish in 5s or be abandoned
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]).catch(() => {})

    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
