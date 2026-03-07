/**
 * FCM HTTP v1 Push — sends push notifications via Firebase Cloud Messaging.
 *
 * Uses Google Service Account JWT for auth — zero external dependencies.
 * Reads credentials from environment variables:
 *   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY
 *
 * Tokens are read from the `device_push_tokens` table (platform = 'android').
 */
import * as crypto from 'crypto'
import { createAdminClient } from '@/utils/supabase/admin'
import { logInfo, logError, logWarn } from '@/lib/logger'

// ─── Configuration ──────────────────────────────────────────────────────────

function getFcmConfig() {
    const projectId = String(process.env.FCM_PROJECT_ID || '').trim()
    const clientEmail = String(process.env.FCM_CLIENT_EMAIL || '').trim()
    const privateKey = String(process.env.FCM_PRIVATE_KEY || '').trim()
    if (!projectId || !clientEmail || !privateKey) return null
    return { projectId, clientEmail, privateKey }
}

// ─── Service Account JWT (cached for 50 min) ────────────────────────────────

let cachedGoogleJwt: { token: string; expiresAt: number } | null = null

async function getGoogleAccessToken(cfg: {
    clientEmail: string
    privateKey: string
}): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000)
    if (cachedGoogleJwt && cachedGoogleJwt.expiresAt > now + 60) {
        return cachedGoogleJwt.token
    }

    try {
        // Build JWT for Google OAuth2
        const header = Buffer.from(
            JSON.stringify({ alg: 'RS256', typ: 'JWT' })
        ).toString('base64url')

        const payload = Buffer.from(
            JSON.stringify({
                iss: cfg.clientEmail,
                scope: 'https://www.googleapis.com/auth/firebase.messaging',
                aud: 'https://oauth2.googleapis.com/token',
                iat: now,
                exp: now + 3600,
            })
        ).toString('base64url')

        const unsigned = `${header}.${payload}`
        const pem = cfg.privateKey.replace(/\\n/g, '\n')

        const signature = crypto.sign('sha256', Buffer.from(unsigned), {
            key: pem,
        })

        const jwt = `${unsigned}.${signature.toString('base64url')}`

        // Exchange JWT for access token
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
        })

        if (!res.ok) {
            const errText = await res.text()
            logError('fcm', `[FCM] OAuth2 token exchange failed: ${errText}`)
            return null
        }

        const data = (await res.json()) as { access_token?: string; expires_in?: number }
        const accessToken = data.access_token
        if (!accessToken) return null

        cachedGoogleJwt = {
            token: accessToken,
            expiresAt: now + (data.expires_in || 3500),
        }
        return accessToken
    } catch (e) {
        logError('fcm', '[FCM] Failed to get Google access token', e)
        return null
    }
}

// ─── Send single push via FCM HTTP v1 ───────────────────────────────────────

async function sendOneFcmPush(
    token: string,
    title: string,
    body: string,
    accessToken: string,
    projectId: string,
    extra?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
    try {
        const message: Record<string, unknown> = {
            message: {
                token,
                notification: { title, body },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channel_id: 'irontracks_default',
                        notification_count: 1,
                    },
                },
                data: extra
                    ? Object.fromEntries(
                        Object.entries(extra).map(([k, v]) => [k, String(v)])
                    )
                    : undefined,
            },
        }

        const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        })

        if (res.ok) {
            logInfo('fcm', `[FCM] Push sent OK — token=${token.slice(0, 8)}...`)
            return { ok: true }
        }

        const errBody = await res.text()
        let reason = errBody
        try {
            const json = JSON.parse(errBody)
            reason = json?.error?.message || errBody
        } catch {
            /* keep raw */
        }

        logWarn('fcm', `[FCM] Push failed: ${reason} — token=${token.slice(0, 8)}...`)
        return { ok: false, error: reason }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logError('fcm', '[FCM] Unexpected error in sendOneFcmPush', msg)
        return { ok: false, error: msg }
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send push notifications to all Android devices of the given user IDs.
 * Reads tokens from `device_push_tokens` table (platform = 'android').
 * Fire-and-forget — never throws.
 */
export async function sendFcmToUsers(
    userIds: string[],
    title: string,
    body: string,
    extra?: Record<string, unknown>
): Promise<Array<{ token: string; ok: boolean; error?: string }>> {
    const results: Array<{ token: string; ok: boolean; error?: string }> = []
    try {
        const cfg = getFcmConfig()
        if (!cfg) {
            logWarn(
                'fcm',
                '[FCM] sendFcmToUsers: config missing — set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY in env vars'
            )
            return results
        }

        const ids = userIds.filter(Boolean)
        if (!ids.length) return results

        const accessToken = await getGoogleAccessToken(cfg)
        if (!accessToken) {
            logError('fcm', '[FCM] Could not obtain Google access token')
            return results
        }

        const admin = createAdminClient()
        const { data: tokens, error: tokenErr } = await admin
            .from('device_push_tokens')
            .select('token')
            .in('user_id', ids)
            .eq('platform', 'android')
            .limit(500)

        if (tokenErr) {
            logError('fcm', '[FCM] Failed to fetch device tokens', tokenErr)
            return results
        }
        if (!Array.isArray(tokens) || !tokens.length) {
            logWarn(
                'fcm',
                `[FCM] No Android tokens found for ${ids.length} user(s)`
            )
            return results
        }

        logInfo(
            'fcm',
            `[FCM] Sending push to ${tokens.length} device(s) for ${ids.length} user(s): "${title}"`
        )

        const allTokens = tokens
            .map((t) => String(t.token || '').trim())
            .filter(Boolean)
        const batchSize = 20
        for (let i = 0; i < allTokens.length; i += batchSize) {
            const batch = allTokens.slice(i, i + batchSize)
            const batchResults = await Promise.allSettled(
                batch.map((t) =>
                    sendOneFcmPush(t, title, body, accessToken, cfg.projectId, extra)
                )
            )
            batchResults.forEach((res, idx) => {
                const token = batch[idx]
                if (res.status === 'fulfilled') {
                    results.push({ token, ...res.value })
                } else {
                    results.push({ token, ok: false, error: String(res.reason) })
                }
            })
        }
    } catch (e) {
        logError('fcm', '[FCM] Unexpected error in sendFcmToUsers', e)
    }
    return results
}
