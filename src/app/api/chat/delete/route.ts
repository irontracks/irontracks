import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    messageId: z.string().optional(),
    message_id: z.string().optional(),
    scope: z.string().optional(),
  })
  .strip()

const extractStoragePathFromPublicUrl = (bucket: string, publicUrl: string) => {
  const url = String(publicUrl || '').trim()
  if (!url) return null
  try {
    const u = new URL(url)
    const marker = `/storage/v1/object/public/${bucket}/`
    const idx = u.pathname.indexOf(marker)
    if (idx >= 0) {
      const p = u.pathname.slice(idx + marker.length)
      return decodeURIComponent(p).replace(/^\/+/, '')
    }
    const alt = `/${bucket}/`
    const idx2 = u.pathname.indexOf(alt)
    if (idx2 >= 0) {
      const p = u.pathname.slice(idx2 + alt.length)
      return decodeURIComponent(p).replace(/^\/+/, '')
    }
  } catch {}
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const messageId = String(body?.messageId || body?.message_id || '').trim()
    const scope = String(body?.scope || '').trim().toLowerCase() === 'direct' ? 'direct' : 'channel'
    if (!messageId) return NextResponse.json({ ok: false, error: 'message_id required' }, { status: 400 })

    const admin = createAdminClient()

    const table = scope === 'direct' ? 'direct_messages' : 'messages'
    const ownerCol = scope === 'direct' ? 'sender_id' : 'user_id'

    const { data: msg, error } = await admin
      .from(table)
      .select('*')
      .eq('id', messageId)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    if (!msg?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const ownerId = String((msg as Record<string, unknown>)[ownerCol] || '').trim()
    if (!ownerId || ownerId !== String(auth.user.id || '').trim()) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const content = String((msg as Record<string, unknown>).content || '').trim()
    const paths: string[] = []
    try {
      const payload = JSON.parse(content)
      const type = String(payload?.type || '').toLowerCase()
      if (type === 'image' || type === 'video') {
        const media = extractStoragePathFromPublicUrl('chat-media', String(payload?.media_url || ''))
        const thumb = extractStoragePathFromPublicUrl('chat-media', String(payload?.thumb_url || ''))
        if (media) paths.push(media)
        if (thumb) paths.push(thumb)
      }
    } catch {}

    await admin.from('soft_delete_bin').insert({
      deleted_by: auth.user.id,
      delete_reason: 'user_manual_delete',
      entity_type: scope === 'direct' ? 'direct_message' : 'chat_message',
      entity_id: messageId,
      payload: { message: msg },
      media_paths: paths,
    })

    await admin.from('audit_events').insert({
      actor_id: auth.user.id,
      actor_email: String(auth.user.email || '').trim() || null,
      actor_role: 'user',
      action: scope === 'direct' ? 'direct_message_delete' : 'chat_message_delete',
      entity_type: scope === 'direct' ? 'direct_message' : 'chat_message',
      entity_id: messageId,
      metadata: { hasMedia: paths.length > 0 },
    })

    if (paths.length) {
      await admin.storage.from('chat-media').remove(Array.from(new Set(paths)))
    }

    const { error: delErr } = await admin.from(table).delete().eq('id', messageId)
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
