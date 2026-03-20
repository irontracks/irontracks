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
import * as http2 from 'http2'
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

// ─── JWT Token (ES256, mutex-cached for 50 min) ─────────────────────────────
// Mutex pattern prevents double-token generation under concurrent serverless invocations.
// Apple rejects a second JWT with the same `iss` issued within 60 min.

let cachedJwt: { token: string; expiresAt: number } | null = null
let jwtRefreshInFlight: Promise<string> | null = null

async function getJwt(cfg: { keyId: string; teamId: string; keyP8: string }): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    if (cachedJwt && cachedJwt.expiresAt > now + 60) return cachedJwt.token

    // If a refresh is already in flight, await it instead of generating a second token
    if (jwtRefreshInFlight) return jwtRefreshInFlight

    const doRefresh = async (): Promise<string> => {
        const issuedAt = Math.floor(Date.now() / 1000)
        const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: cfg.keyId })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ iss: cfg.teamId, iat: issuedAt })).toString('base64url')
        const unsigned = `${header}.${payload}`

        // The .p8 key may come with literal \n in env vars — normalize
        const pem = cfg.keyP8.replace(/\\n/g, '\n')
        const signature = crypto.sign('sha256', Buffer.from(unsigned), {
            key: pem,
            dsaEncoding: 'ieee-p1363',
        })

        const token = `${unsigned}.${signature.toString('base64url')}`
        cachedJwt = { token, expiresAt: issuedAt + 50 * 60 } // cache 50 min (Apple max is 60)
        return token
    }

    jwtRefreshInFlight = doRefresh().finally(() => { jwtRefreshInFlight = null })
    return jwtRefreshInFlight
}

// ─── Send single push via HTTP/2 ────────────────────────────────────────────

async function sendOneApnsPush(
    token: string,
    title: string,
    body: string,
    cfg: { keyId: string; teamId: string; keyP8: string; bundleId: string },
    extra?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
    // Resolve JWT before entering Promise executor (getJwt is now async/mutex)
    let jwt: string
    try {
        jwt = await getJwt(cfg)
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logError('apns', '[APNs] Failed to generate JWT', msg)
        return { ok: false, error: msg }
    }

    return new Promise((resolve) => {
        try {
            const apnsPayload = JSON.stringify({
                aps: {
                    alert: { title, body },
                    sound: 'default',
                    badge: (extra?.__badge as number | undefined) ?? 1,
                    // time-sensitive bypasses iOS Focus Mode — reserve for urgent notifications only.
                    // workout_reminder and message are time-critical; social events use 'active'.
                    'interruption-level': (() => {
                        const type = String(extra?.type ?? '').toLowerCase()
                        const urgent = ['workout_reminder', 'rest_timer', 'message', 'direct_message']
                        return urgent.includes(type) ? 'time-sensitive' : 'active'
                    })(),
                },
                // Spread extra but omit the internal __badge key used only for the aps.badge field
                ...Object.fromEntries(Object.entries(extra ?? {}).filter(([k]) => k !== '__badge')),
            })

            // Xcode debug builds use development provisioning profile → sandbox tokens
            // Set APNS_PRODUCTION=true in Vercel env only for TestFlight/App Store builds
            const isProduction = String(process.env.APNS_PRODUCTION || '').trim().toLowerCase() === 'true'
            const host = isProduction
                ? 'https://api.push.apple.com'
                : 'https://api.sandbox.push.apple.com'

            const client = http2.connect(host)

            client.on('error', (err) => {
                logError('apns', '[APNs] HTTP/2 client error', err)
                resolve({ ok: false, error: err.message })
            })

            const req = client.request({
                ':method': 'POST',
                ':path': `/3/device/${token}`,
                'authorization': `bearer ${jwt}`,
                'apns-topic': cfg.bundleId,
                'apns-push-type': 'alert',
                'apns-priority': '10',
                'apns-expiration': '0',
                'content-type': 'application/json',
            })

            req.on('response', (headers) => {
                const status = headers[':status']
                let data = ''
                req.on('data', (chunk) => { data += chunk })
                req.on('end', () => {
                    client.close()
                    if (status === 200) {
                        logInfo('apns', `[APNs] Push sent OK — token=${token.slice(0, 8)}...`)
                        resolve({ ok: true })
                    } else {
                        let reason = data
                        try {
                            const json = JSON.parse(data)
                            reason = json.reason || data
                        } catch {
                            reason = data || `HTTP ${status}`
                        }
                        logWarn('apns', `[APNs] Push failed: ${reason} — token=${token.slice(0, 8)}...`)

                        // Auto-remove stale tokens — Apple won't deliver to them again
                        if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
                            const admin = createAdminClient()
                            Promise.resolve(
                                admin.from('device_push_tokens').delete().eq('token', token)
                            )
                                .then(() => logWarn('apns', `[APNs] Removed stale token: ${token.slice(0, 8)}...`))
                                .catch(() => { /* best-effort */ })
                        }

                        resolve({ ok: false, error: reason })
                    }
                })
            })

            req.on('error', (err) => {
                client.close()
                logError('apns', '[APNs] Request error', err)
                resolve({ ok: false, error: err.message })
            })

            req.write(apnsPayload)
            req.end()
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logError('apns', '[APNs] Unexpected error in sendOneApnsPush', msg)
            resolve({ ok: false, error: msg })
        }
    })
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
): Promise<Array<{ token: string; ok: boolean; error?: string }>> {
    const results: Array<{ token: string; ok: boolean; error?: string }> = []
    try {
        const ids = userIds.filter(Boolean)
        if (!ids.length) return results

        // ── iOS (APNs) only — Android (FCM) is handled by sender.ts ────────
        // Do NOT call sendFcmToUsers here. Callers that need multi-platform
        // delivery should use sendPushToAllPlatforms from @/lib/push/sender.
        const cfg = getApnsConfig()
        if (!cfg) {
            logWarn('apns', '[APNs] sendPushToUsers: APNs config missing — set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 in Vercel env vars')
            return results
        }

        const admin = createAdminClient()

        // ── Dynamic badge count per user ────────────────────────────────────
        // Fetch unread notification counts for all users in a single query.
        // Falls back to badge=1 if the query fails.
        const badgeByUserId = new Map<string, number>()
        try {
            const { data: unreadRows } = await admin
                .from('notifications')
                .select('user_id')
                .in('user_id', ids)
                .eq('is_read', false)
            if (Array.isArray(unreadRows)) {
                for (const r of unreadRows) {
                    const uid = String(r?.user_id || '')
                    if (uid) badgeByUserId.set(uid, (badgeByUserId.get(uid) ?? 0) + 1)
                }
            }
        } catch { /* badge fallback to 1 */ }

        const { data: tokens, error: tokenErr } = await admin
            .from('device_push_tokens')
            .select('token, user_id')
            .in('user_id', ids)
            .eq('platform', 'ios')
            .limit(500)

        if (tokenErr) {
            logError('apns', '[APNs] Failed to fetch device tokens', tokenErr)
            return results
        }
        if (!Array.isArray(tokens) || !tokens.length) {
            logWarn('apns', `[APNs] No iOS tokens found for ${ids.length} user(s) — make sure @capacitor/push-notifications registered successfully`)
            return results
        }

        logInfo('apns', `[APNs] Sending push to ${tokens.length} device(s) for ${ids.length} user(s): "${title}"`)

        const allTokens = tokens
            .map((t) => ({ token: String(t.token || '').trim(), userId: String(t.user_id || '') }))
            .filter((t) => t.token)
        const batchSize = 20
        for (let i = 0; i < allTokens.length; i += batchSize) {
            const batch = allTokens.slice(i, i + batchSize)
            const batchResults = await Promise.allSettled(
                batch.map(({ token, userId }) => {
                    const badge = badgeByUserId.get(userId) ?? 1
                    return sendOneApnsPush(token, title, body, cfg, { ...extra, __badge: badge })
                })
            )
            batchResults.forEach((res, idx) => {
                const token = batch[idx].token
                if (res.status === 'fulfilled') {
                    results.push({ token, ...res.value })
                } else {
                    results.push({ token, ok: false, error: String(res.reason) })
                }
            })
        }
    } catch (e) {
        logError('apns', '[APNs] Unexpected error in sendPushToUsers', e)
    }
    return results
}
