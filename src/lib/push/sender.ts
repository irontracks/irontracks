/**
 * Unified Push Sender — sends push notifications to ALL platforms.
 *
 * This module is the single entry point for sending push notifications.
 * It dispatches to APNs (iOS) and FCM (Android) in parallel.
 *
 * The sender enforces two layers of user preference BEFORE dispatching:
 *   1. Master switch: `user_settings.preferences.pushNotificationsEnabled`
 *      When `false`, no push is delivered to that user — regardless of type.
 *   2. Per-type switch: passed as `preferenceKey` by the caller (optional).
 *      When the matching pref is `false`, the user is skipped.
 *
 * Usage:
 *   import { sendPushToAllPlatforms } from '@/lib/push/sender'
 *   await sendPushToAllPlatforms(userIds, title, body, extra)
 *   // With per-type filter:
 *   await sendPushToAllPlatforms(userIds, title, body, extra, { preferenceKey: 'notifyFriendPRs' })
 */
import { sendPushToUsers as sendApns } from './apns'
import { sendFcmToUsers } from './fcm'
import { logInfo, logWarn } from '@/lib/logger'
import { createAdminClient } from '@/utils/supabase/admin'
import { isUserInQuietHours } from '@/lib/push/quietHours'

export type PushResult = { token: string; ok: boolean; error?: string; platform: 'ios' | 'android' }

export interface SendPushOptions {
    /**
     * Per-type preference key (e.g. 'notifyFriendPRs'). When set, users whose
     * matching pref is explicitly `false` are filtered out BEFORE push is sent.
     * Missing prefs default to enabled.
     */
    preferenceKey?: string
    /**
     * Skip the master switch check. Only use for system-critical pushes that
     * the user cannot opt out of (e.g. security alerts). Default: false.
     */
    bypassMasterSwitch?: boolean
}

/**
 * Filter user IDs by push-related preferences.
 *
 * Applies, in order:
 *   - Master switch (`pushNotificationsEnabled`) unless bypassed.
 *   - Per-type switch (e.g. `notifyFriendPRs`) if `preferenceKey` given.
 *
 * Users with no user_settings row are considered opted-IN (defaults to on).
 */
async function filterUserIdsForPush(
    userIds: string[],
    options: SendPushOptions = {},
): Promise<string[]> {
    const ids = userIds.filter(Boolean)
    if (!ids.length) return []
    // Fast path: no filtering requested and master bypassed → return as-is.
    if (options.bypassMasterSwitch && !options.preferenceKey) return ids

    try {
        const admin = createAdminClient()
        const { data } = await admin
            .from('user_settings')
            .select('user_id, preferences')
            .in('user_id', ids)

        const rows = Array.isArray(data) ? data : []
        const prefsByUser = new Map<string, Record<string, unknown>>()
        for (const r of rows) {
            const uid = String(r?.user_id || '')
            const prefs =
                r?.preferences && typeof r.preferences === 'object'
                    ? (r.preferences as Record<string, unknown>)
                    : {}
            if (uid) prefsByUser.set(uid, prefs)
        }

        return ids.filter((uid) => {
            const prefs = prefsByUser.get(uid)
            // No settings row → user hasn't opted out → allow.
            if (!prefs) return true

            if (!options.bypassMasterSwitch && prefs.pushNotificationsEnabled === false) return false

            // "Não perturbar": pula o push na janela de silêncio (in-app segue).
            // Bypassed (crítico: cobrança/segurança) ignora a janela.
            if (!options.bypassMasterSwitch && isUserInQuietHours(prefs)) return false

            if (options.preferenceKey) {
                const raw = prefs[options.preferenceKey]
                if (raw === false) return false
            }

            return true
        })
    } catch (e) {
        // Fail open: if the pref lookup fails we'd rather deliver the push than
        // silently drop every notification across the app.
        logWarn('push', '[Push] Preference lookup failed — delivering to all requested users', e)
        return ids
    }
}

/**
 * Send push notifications to all devices (iOS + Android) of the given user IDs.
 * Fire-and-forget — never throws.
 */
export async function sendPushToAllPlatforms(
    userIds: string[],
    title: string,
    body: string,
    extra?: Record<string, unknown>,
    options: SendPushOptions = {},
): Promise<PushResult[]> {
    const requestedIds = userIds.filter(Boolean)
    if (!requestedIds.length) return []

    const allowedIds = await filterUserIdsForPush(requestedIds, options)
    if (!allowedIds.length) {
        logInfo(
            'push',
            `[Push] All ${requestedIds.length} recipient(s) opted out via preferences` +
                (options.preferenceKey ? ` (key=${options.preferenceKey})` : ''),
        )
        return []
    }

    if (allowedIds.length !== requestedIds.length) {
        logInfo(
            'push',
            `[Push] Filtered ${requestedIds.length - allowedIds.length} opted-out recipient(s); ` +
                `delivering to ${allowedIds.length}`,
        )
    }

    logInfo('push', `[Push] Sending to ${allowedIds.length} user(s) across all platforms: "${title}"`)

    const [iosResults, androidResults] = await Promise.all([
        sendApns(allowedIds, title, body, extra),
        sendFcmToUsers(allowedIds, title, body, extra),
    ])

    const results: PushResult[] = [
        ...iosResults.map((r) => ({ ...r, platform: 'ios' as const })),
        ...androidResults.map((r) => ({ ...r, platform: 'android' as const })),
    ]

    const totalOk = results.filter((r) => r.ok).length
    const totalFail = results.filter((r) => !r.ok).length
    logInfo('push', `[Push] Delivery complete: ${totalOk} ok, ${totalFail} failed, ${results.length} total`)

    return results
}
