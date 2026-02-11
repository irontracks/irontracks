import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getInternalSecret, hasValidInternalSecret } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const isAuthorized = (req: Request) => {
  if (hasValidInternalSecret(req)) return true
  try {
    const url = new URL(req.url)
    const provided = String(url.searchParams.get('secret') || '').trim()
    const secret = getInternalSecret()
    return !!secret && provided === secret
  } catch {
    return false
  }
}

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

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

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const result = {
    ok: true,
    cutoffIso,
    stories: { expired: 0, storageRemoved: 0, deletedRows: 0 },
    chat: { expiredMessages: 0, storageRemoved: 0, deletedRows: 0 },
    direct: { expiredMessages: 0, storageRemoved: 0, deletedRows: 0 },
  }

  const { data: expiredStories } = await admin
    .from('social_stories')
    .select('id, media_path')
    .eq('is_deleted', false)
    .lte('expires_at', nowIso)
    .limit(500)

  const storyIds = (expiredStories || []).map((s) => String(s.id)).filter(Boolean)
  const storyPaths = (expiredStories || []).map((s) => String(s.media_path || '')).filter(Boolean)
  result.stories.expired = storyIds.length

  if (storyPaths.length) {
    for (const part of chunk(storyPaths, 100)) {
      const { data } = await admin.storage.from('social-stories').remove(part)
      result.stories.storageRemoved += Array.isArray(data) ? data.length : 0
    }
  }
  if (storyIds.length) {
    const { error } = await admin.from('social_stories').delete().in('id', storyIds)
    if (!error) result.stories.deletedRows = storyIds.length
  }

  await admin.from('audit_events').insert({
    actor_role: 'service',
    action: 'cron_cleanup_expired_stories',
    entity_type: 'cron',
    metadata: { cutoffIso, deleted: result.stories.deletedRows },
  })

  const cleanupChatTable = async (table: 'messages' | 'direct_messages', bucket: 'chat-media') => {
    const { data: rows, error: selErr } = await admin
      .from(table)
      .select('id, content, created_at')
      .lte('created_at', cutoffIso)
      .limit(500)
    if (selErr) return

    const ids: string[] = []
    const paths: string[] = []

    for (const r of rows || []) {
      const id = String((r as any).id || '')
      if (!id) continue
      const content = String((r as any).content || '').trim()
      try {
        const payload = JSON.parse(content)
        const type = String(payload?.type || '').toLowerCase()
        if (type !== 'image' && type !== 'video') continue

        const mediaUrl = String(payload?.media_url || '')
        const thumbUrl = String(payload?.thumb_url || '')
        const media = extractStoragePathFromPublicUrl(bucket, mediaUrl)
        const thumb = extractStoragePathFromPublicUrl(bucket, thumbUrl)

        if (!media && !thumb) continue
        ids.push(id)
        if (media) paths.push(media)
        if (thumb) paths.push(thumb)
      } catch {}
    }

    if (paths.length) {
      for (const part of chunk(Array.from(new Set(paths)), 100)) {
        const { data } = await admin.storage.from(bucket).remove(part)
        const removed = Array.isArray(data) ? data.length : 0
        if (table === 'messages') result.chat.storageRemoved += removed
        else result.direct.storageRemoved += removed
      }
    }

    if (ids.length) {
      const { error } = await admin.from(table).delete().in('id', ids)
      if (!error) {
        if (table === 'messages') result.chat.deletedRows += ids.length
        else result.direct.deletedRows += ids.length
      }
    }

    if (table === 'messages') result.chat.expiredMessages += ids.length
    else result.direct.expiredMessages += ids.length
  }

  await cleanupChatTable('messages', 'chat-media')
  await cleanupChatTable('direct_messages', 'chat-media')

  await admin.from('audit_events').insert({
    actor_role: 'service',
    action: 'cron_cleanup_expired_chat_media',
    entity_type: 'cron',
    metadata: {
      cutoffIso,
      messagesDeleted: result.chat.deletedRows,
      directDeleted: result.direct.deletedRows,
    },
  })

  return NextResponse.json(result)
}
