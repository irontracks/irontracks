import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { filterRecipientsByPreference, insertNotifications, listFollowerIdsOf, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const isAllowedStoryPath = (userId: string, path: string) => {
  const uid = String(userId || '').trim()
  const p = String(path || '').trim()
  if (!uid || !p) return false
  if (p.includes('..') || p.includes('\\') || p.includes('\0') || p.startsWith('/')) return false
  const parts = p.split('/').filter(Boolean)
  if (parts.length < 3) return false
  if (parts[0] !== uid) return false
  if (parts[1] !== 'stories') return false
  const name = parts.slice(2).join('/')
  if (!name.endsWith('.jpg') && !name.endsWith('.jpeg') && !name.endsWith('.png')) return false
  return true
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const body = await req.json().catch(() => ({}))
    const mediaPath = String(body?.mediaPath || body?.media_path || '').trim()
    const caption = body?.caption != null ? String(body.caption).trim() : null
    const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

    if (!mediaPath) return NextResponse.json({ ok: false, error: 'media_path required' }, { status: 400 })
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

    if (error || !data?.id) return NextResponse.json({ ok: false, error: error?.message || 'failed' }, { status: 400 })

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
    } catch {}
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
