/**
 * APNs Remote Push — sends push notifications via Apple Push Notification service.
 *
 * Uses HTTP/2 with JWT (ES256) auth — zero external dependencies.
 * Reads credentials from environment variables:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8, APNS_BUNDLE_ID
 *
 * Tokens are read from the `device_push_tokens` table (already populated by usePushNotifications.ts).
 */
import * as crypto from 'crypto'
import { createAdminClient } from '@/utils/supabase/admin'
import { logInfo, logError, logWarn } from '@/lib/logger'

// ─── Configuration ──────────────────────────────────────────────────────────

function getApnsConfig() {
    const keyId = String(process.env.APNS_KEY_ID || '').trim()
    const teamId = String(process.env.APNS_TEAM_ID || '').trim()
    const keyP8 = String(process.env.APNS_KEY_P8 || '').trim()
    const bundleId = String(process.env.APNS_BUNDLE_ID || 'com.irontracks.app').trim()
    if (!keyId || !teamId || !keyP8) return null
    return { keyId, teamId, keyP8, bundleId }
}

// ─── JWT Token (ES256, cached for 50 min) ───────────────────────────────────

let cachedJwt: { token: string; expiresAt: number } | null = null

function getJwt(cfg: { keyId: string; teamId: string; keyP8: string }): string {
    const now = Math.floor(Date.now() / 1000)
    if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token

    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: cfg.teamId, iat: now })).toString('base64url')
    const unsigned = `${header}.${payload}`

    // The .p8 key may come with literal \n in env vars — normalize
    const pem = cfg.keyP8.replace(/\\n/g, '\n')
    const signature = crypto.sign('sha256', Buffer.from(unsigned), {
        key: pem,
        dsaEncoding: 'ieee-p1363',
    })

    const token = `${unsigned}.${signature.toString('base64url')}`
    cachedJwt = { token, expiresAt: now + 50 * 60 } // cache 50 min (max 60)
    return token
}

// ─── Send single push via HTTP/2 ────────────────────────────────────────────

async function sendOneApnsPush(
    token: string,
    title: string,
    body: string,
    cfg: { keyId: string; teamId: string; keyP8: string; bundleId: string },
    extra?: Record<string, unknown>
): Promise<boolean> {
    const jwt = getJwt(cfg)
    const apnsPayload = JSON.stringify({
        aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
        },
        ...extra,
    })

    const isProduction = true
    const host = isProduction
        ? 'https://api.push.apple.com'
        : 'https://api.sandbox.push.apple.com'

    try {
        const res = await fetch(`${host}/3/device/${token}`, {
            method: 'POST',
            headers: {
                'authorization': `bearer ${jwt}`,
                'apns-topic': cfg.bundleId,
                'apns-push-type': 'alert',
                'apns-priority': '10',
                'apns-expiration': '0',
                'content-type': 'application/json',
            },
            body: apnsPayload,
        })
        if (!res.ok) {
            const errBody = await res.text().catch(() => '')
            logWarn('apns', `[APNs] Push failed: HTTP ${res.status} — token=${token.slice(0, 8)}... — ${errBody}`)
        } else {
            logInfo('apns', `[APNs] Push sent OK — token=${token.slice(0, 8)}...`)
        }
        return res.ok
    } catch (e) {
        logError('apns', '[APNs] Network error sending push', { token: token.slice(0, 8), err: e })
        return false
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send push notifications to all devices of the given user IDs.
 * Reads tokens from `device_push_tokens` table.
 * Fire-and-forget — never throws.
 */
export async function sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
    extra?: Record<string, unknown>
): Promise<void> {
    try {
        const cfg = getApnsConfig()
        if (!cfg) {
            logWarn('apns', '[APNs] sendPushToUsers: config missing — set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 in Vercel env vars')
            return
        }

        const ids = userIds.filter(Boolean)
        if (!ids.length) return

        const admin = createAdminClient()
        const { data: tokens, error: tokenErr } = await admin
            .from('device_push_tokens')
            .select('token')
            .in('user_id', ids)
            .eq('platform', 'ios')
            .limit(500)

        if (tokenErr) {
            logError('apns', '[APNs] Failed to fetch device tokens', tokenErr)
            return
        }
        if (!Array.isArray(tokens) || !tokens.length) {
            logWarn('apns', `[APNs] No iOS tokens found for ${ids.length} user(s) — make sure @capacitor/push-notifications registered successfully`)
            return
        }

        logInfo('apns', `[APNs] Sending push to ${tokens.length} device(s) for ${ids.length} user(s): "${title}"`)

        // Send in parallel, max 20 concurrent
        const allTokens = tokens.map((t) => String(t.token || '').trim()).filter(Boolean)
        const batchSize = 20
        for (let i = 0; i < allTokens.length; i += batchSize) {
            const batch = allTokens.slice(i, i + batchSize)
            await Promise.allSettled(
                batch.map((t) => sendOneApnsPush(t, title, body, cfg, extra))
            )
        }
    } catch (e) {
        logError('apns', '[APNs] Unexpected error in sendPushToUsers', e)
    }
}
