/**
 * Unified Push Sender — sends push notifications to ALL platforms.
 * 
 * This module is the single entry point for sending push notifications.
 * It dispatches to APNs (iOS) and FCM (Android) in parallel.
 *
 * Usage:
 *   import { sendPushToUsers } from '@/lib/push/sender'
 *   await sendPushToUsers(userIds, title, body, extra)
 */
import { sendPushToUsers as sendApns } from './apns'
import { sendFcmToUsers } from './fcm'
import { logInfo } from '@/lib/logger'

export type PushResult = { token: string; ok: boolean; error?: string; platform: 'ios' | 'android' }

/**
 * Send push notifications to all devices (iOS + Android) of the given user IDs.
 * Fire-and-forget — never throws.
 */
export async function sendPushToAllPlatforms(
    userIds: string[],
    title: string,
    body: string,
    extra?: Record<string, unknown>
): Promise<PushResult[]> {
    const ids = userIds.filter(Boolean)
    if (!ids.length) return []

    logInfo('push', `[Push] Sending to ${ids.length} user(s) across all platforms: "${title}"`)

    const [iosResults, androidResults] = await Promise.all([
        sendApns(ids, title, body, extra),
        sendFcmToUsers(ids, title, body, extra),
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
