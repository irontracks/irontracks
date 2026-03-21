import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'
import { logError } from '@/lib/logger'

const chunk = (arr: unknown, size: unknown): unknown[][] => {
  const out: unknown[][] = []
  const safe = Array.isArray(arr) ? arr : []
  const n = Math.max(1, Number(size) || 1)
  for (let i = 0; i < safe.length; i += n) out.push(safe.slice(i, i + n))
  return out
}

export async function listFollowerIdsOf(userId: unknown): Promise<string[]> {
  const uid = String(userId || '').trim()
  if (!uid) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('social_follows')
    .select('follower_id')
    .eq('following_id', uid)
    .eq('status', 'accepted')
    .limit(5000)
  return (Array.isArray(data) ? data : [])
    .map((r) => String(r?.follower_id || '').trim())
    .filter(Boolean)
}

export async function filterRecipientsByPreference(recipientIds: unknown, preferenceKey: unknown): Promise<string[]> {
  const key = String(preferenceKey || '').trim()
  const ids = (Array.isArray(recipientIds) ? recipientIds : []).map((v) => String(v || '').trim()).filter(Boolean)
  if (!key || ids.length === 0) return ids

  const admin = createAdminClient()
  const { data } = await admin.from('user_settings').select('user_id, preferences').in('user_id', ids)
  const rows = Array.isArray(data) ? data : []
  const byId = new Map(
    rows.map((r) => [
      String(r?.user_id || ''),
      r?.preferences && typeof r.preferences === 'object' ? r.preferences : null,
    ])
  )

  return ids.filter((id) => {
    const prefs = byId.get(id) && typeof byId.get(id) === 'object' ? (byId.get(id) as Record<string, unknown>) : null
    if (!prefs) return true
    const raw = prefs[key]
    return raw !== false
  })
}

export async function shouldThrottleBySenderType(senderId: unknown, type: unknown, windowMinutes: unknown): Promise<boolean> {
  const sid = String(senderId || '').trim()
  const t = String(type || '').trim()
  const minutes = Math.max(1, Number(windowMinutes) || 15)
  if (!sid || !t) return false
  const admin = createAdminClient()
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString()
  const { data } = await admin.from('notifications').select('id').eq('type', t).eq('sender_id', sid).gte('created_at', since).limit(1)
  return Array.isArray(data) && data.length > 0
}

export async function insertNotifications(rows: unknown): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const admin = createAdminClient()
  const safeRows = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...(r as Record<string, unknown>), is_read: false, read: false }) as Record<string, unknown>)
  if (!safeRows.length) return { ok: true, inserted: 0 }

  let inserted = 0
  for (const part of chunk(safeRows, 500)) {
    const { error } = await admin.from('notifications').insert(part as unknown as Array<Record<string, unknown>>)
    if (error) {
      const msg = String(getErrorMessage(error) ?? error)
      const lower = msg.toLowerCase()
      const schemaMismatch =
        lower.includes('column') &&
        (lower.includes('sender_id') ||
          lower.includes('recipient_id') ||
          lower.includes('metadata') ||
          lower.includes('is_read'))
      if (!schemaMismatch) return { ok: false, error: msg, inserted }

      // R6#1: Fallback must use is_read (not read) and preserve core columns
      const fallback = (part as unknown[]).map((r) => {
        const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : ({} as Record<string, unknown>)
        return {
          user_id: row.user_id,
          title: row.title,
          message: row.message,
          type: row.type,
          is_read: false,
        }
      })
      const { error: fallbackError } = await admin.from('notifications').insert(fallback)
      if (fallbackError) return { ok: false, error: String(fallbackError?.message ?? fallbackError), inserted }
    }
    inserted += (part as unknown[]).length
  }
  // Fire-and-forget: send remote push to all recipient devices, grouped by notification type.
  // Grouping ensures each recipient hears the right message, not always the first row's title.
  // Fan-out is capped at PUSH_FAN_OUT_LIMIT to prevent Lambda timeouts on popular profiles.
  try {
    const PUSH_FAN_OUT_LIMIT = 1000

    // Group rows by type+title+message so every distinct notification body is delivered correctly
    const groups = new Map<string, { title: string; message: string; type: string; link?: string; recipientIds: string[] }>()
    for (const r of safeRows) {
      const title = String(r.title || '').trim()
      const message = String(r.message || '').trim()
      const type = String(r.type || '').trim()
      const link = String(r.link || r.action_url || '').trim()
      if (!title || !message) continue
      const key = `${type}|${title}|${message}`
      if (!groups.has(key)) groups.set(key, { title, message, type, link: link || undefined, recipientIds: [] })
      const recipientId = String(r.user_id || r.recipient_id || '').trim()
      if (recipientId) groups.get(key)!.recipientIds.push(recipientId)
    }

    for (const [, group] of groups) {
      const uniqueIds = [...new Set(group.recipientIds)]
      // Throttle: send to at most PUSH_FAN_OUT_LIMIT devices per batch to avoid Lambda timeout
      const batch = uniqueIds.slice(0, PUSH_FAN_OUT_LIMIT)
      if (uniqueIds.length > PUSH_FAN_OUT_LIMIT) {
        logError('insertNotifications.sendPush', `Fan-out throttled: ${uniqueIds.length} recipients, sending to first ${PUSH_FAN_OUT_LIMIT} only`)
      }
      if (!batch.length) continue

      // Deep link payload: type, link and notificationId allow the iOS app to navigate on tap
      const extra: Record<string, string> = { type: group.type }
      if (group.link) extra.link = group.link

      void sendPushToUsers(batch, group.title, group.message, extra).catch(() => { })
    }
  } catch (e) { logError('insertNotifications.sendPush', e) }

  return { ok: true, inserted }
}
