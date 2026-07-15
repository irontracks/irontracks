import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'
import { logError } from '@/lib/logger'
import { waitUntil } from '@vercel/functions'

/**
 * Canonical mapping of notification type → preference key in user_settings.
 *
 * When a notification row has a `type` matching one of these keys, the
 * recipient's preference is respected for BOTH the in-app row insertion
 * and the push delivery. Types NOT in this map fall through as "always
 * deliver" — callers can still filter upstream if they want.
 *
 * Keep in sync with src/schemas/settings.ts and the UI toggles.
 */
export const NOTIFICATION_TYPE_TO_PREFERENCE: Record<string, string> = {
  message: 'notifyDirectMessages',
  direct_message: 'notifyDirectMessages',
  appointment: 'notifyAppointments',
  appointment_created: 'notifyAppointments',
  broadcast: 'notifyBroadcasts',
  follow_request: 'notifySocialFollows',
  follow_accepted: 'notifyFollowAccepted',
  friend_online: 'notifyFriendOnline',
  friend_pr: 'notifyFriendPRs',
  friend_streak: 'notifyFriendStreaks',
  friend_goal: 'notifyFriendGoals',
  workout_finish: 'notifyFriendWorkoutEvents',
  workout_finished: 'notifyFriendWorkoutEvents',
  workout_start: 'notifyFriendWorkoutStart',
  // Professor: push "aluno iniciou o treino" (enviado via sendPushToAllPlatforms com
  // preferenceKey explícito; mapeado aqui também pra manter o invariante toggle<->tipo).
  student_workout_start: 'notifyStudentWorkoutStart',
  friend_comeback: 'notifyFriendComeback',
  friend_achievement: 'notifyAchievements',
  friend_weekly_goal: 'notifyFriendWeeklyGoal',
  story_posted: 'notifyStoryPosted',
  story_like: 'notifyStoryLikes',
  story_reaction: 'notifyStoryReactions',
  story_comment: 'notifyStoryComments',
  mention: 'notifyMentions',
  mentioned_in_comment: 'notifyMentions',
  mentioned_in_chat: 'notifyMentions',
  pr_close: 'notifyNearPR',
  birthday: 'notifyBirthday',
  streak_at_risk: 'notifyStreakAtRisk',
  inactivity: 'notifyInactivity',
  morning_briefing: 'notifyMorningBriefing',
  weekly_recap: 'notifyWeeklyRecap',
  friends_trained_today: 'notifyFriendsTrainedToday',
  water_reminder: 'notifyWaterReminder',
  trial_ending: 'notifyTrialEnding',
  billing_issue: 'notifyBillingIssue',
  daily_goal_hit: 'notifyDailyGoal',
  missed_meal: 'notifyMissedMeal',
  challenge_created: 'notifyChallenges',
  challenge_accepted: 'notifyChallenges',
  challenge_declined: 'notifyChallenges',
  meal_reminder: 'notifyMealReminders',
  workout_reminder: 'notifyWorkoutReminders',
}

/** Given a notification type, return the preference key that gates it, or null. */
export function preferenceKeyForType(type: unknown): string | null {
  const t = String(type || '').trim().toLowerCase()
  return t ? (NOTIFICATION_TYPE_TO_PREFERENCE[t] ?? null) : null
}

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
  const rawRows = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...(r as Record<string, unknown>), is_read: false, read: false }) as Record<string, unknown>)
  if (!rawRows.length) return { ok: true, inserted: 0 }

  // Auto-filter rows by the recipient's preference when the notification type
  // maps to a known pref key. This way callers don't need to remember to
  // filterRecipientsByPreference() upstream — every row that ends up here is
  // either allowed or discarded.
  const recipientsByPrefKey = new Map<string, Set<string>>()
  for (const row of rawRows) {
    const prefKey = preferenceKeyForType(row.type)
    const recipientId = String(row.user_id || row.recipient_id || '').trim()
    if (!prefKey || !recipientId) continue
    if (!recipientsByPrefKey.has(prefKey)) recipientsByPrefKey.set(prefKey, new Set())
    recipientsByPrefKey.get(prefKey)!.add(recipientId)
  }

  // Lookup each recipient's prefs exactly once and cache the allow-set by prefKey
  const allowByPrefKey = new Map<string, Set<string>>()
  if (recipientsByPrefKey.size > 0) {
    try {
      const allIds = new Set<string>()
      recipientsByPrefKey.forEach((set) => set.forEach((id) => allIds.add(id)))
      const { data } = await admin
        .from('user_settings')
        .select('user_id, preferences')
        .in('user_id', Array.from(allIds))
      const prefsByUser = new Map<string, Record<string, unknown>>()
      for (const r of Array.isArray(data) ? data : []) {
        const uid = String(r?.user_id || '')
        const prefs =
          r?.preferences && typeof r.preferences === 'object'
            ? (r.preferences as Record<string, unknown>)
            : {}
        if (uid) prefsByUser.set(uid, prefs)
      }
      recipientsByPrefKey.forEach((recipients, prefKey) => {
        const allowed = new Set<string>()
        recipients.forEach((id) => {
          const prefs = prefsByUser.get(id)
          // Missing settings row → default is on. Explicit false → opt out.
          if (!prefs || prefs[prefKey] !== false) allowed.add(id)
        })
        allowByPrefKey.set(prefKey, allowed)
      })
    } catch (e) {
      // Fail open on pref lookup failure — we'd rather deliver than drop.
      logError('insertNotifications.prefs', e)
    }
  }

  const safeRows = rawRows.filter((row) => {
    const prefKey = preferenceKeyForType(row.type)
    if (!prefKey) return true // no mapping → always deliver
    const allowed = allowByPrefKey.get(prefKey)
    // If we never loaded (or lookup failed) the allow-set, fail open.
    if (!allowed) return true
    const recipientId = String(row.user_id || row.recipient_id || '').trim()
    if (!recipientId) return false
    return allowed.has(recipientId)
  })

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

      // Defense-in-depth: sender also enforces the master push switch and
      // per-type pref. Rows are already pre-filtered but passing the key
      // keeps the two layers consistent if someone changes this file later.
      const prefKey = preferenceKeyForType(group.type)
      waitUntil(
        sendPushToUsers(
          batch,
          group.title,
          group.message,
          extra,
          prefKey ? { preferenceKey: prefKey } : undefined,
        ).catch(() => { })
      )
    }
  } catch (e) { logError('insertNotifications.sendPush', e) }

  return { ok: true, inserted }
}
