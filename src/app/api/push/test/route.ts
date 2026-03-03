import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendPushToUsers } from '@/lib/push/apns'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/push/test
 * Diagnoses the APNs push configuration and sends a real test notification to
 * the currently authenticated user's devices.
 *
 * Returns a JSON summary of what was checked and what happened.
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

        // ── 1. Check env vars ──────────────────────────────────────────────────
        const cfg = {
            APNS_KEY_ID: Boolean(process.env.APNS_KEY_ID?.trim()),
            APNS_TEAM_ID: Boolean(process.env.APNS_TEAM_ID?.trim()),
            APNS_KEY_P8: Boolean(process.env.APNS_KEY_P8?.trim()),
            APNS_BUNDLE_ID: String(process.env.APNS_BUNDLE_ID || '(not set — using com.irontracks.app)'),
        }
        const cfgOk = cfg.APNS_KEY_ID && cfg.APNS_TEAM_ID && cfg.APNS_KEY_P8

        // ── 2. Check if this user has registered device tokens ─────────────────
        const admin = createAdminClient()
        const { data: tokens, error: tokenErr } = await admin
            .from('device_push_tokens')
            .select('token, platform, device_id, last_seen_at, updated_at')
            .eq('user_id', user.id)

        const tokenCount = Array.isArray(tokens) ? tokens.length : 0
        const iosTokenCount = Array.isArray(tokens) ? tokens.filter((t) => String(t.platform || '') === 'ios').length : 0

        // ── 3. Send test push if config is OK ──────────────────────────────────
        let pushResult = 'skipped — APNs config missing or no iOS tokens'
        if (cfgOk && iosTokenCount > 0) {
            await sendPushToUsers(
                [user.id],
                '🔔 IronTracks — Notificação de Teste',
                'Se você está vendo isso, as push notifications estão funcionando!',
            )
            pushResult = `Sent to ${iosTokenCount} iOS device(s) — check Vercel logs for APNs response`
        }

        return NextResponse.json({
            ok: true,
            userId: user.id,
            envVars: cfg,
            envConfigOk: cfgOk,
            deviceTokens: {
                total: tokenCount,
                ios: iosTokenCount,
                tokenFetchError: tokenErr?.message ?? null,
                tokens: Array.isArray(tokens)
                    ? tokens.map((t) => ({
                        platform: t.platform,
                        tokenPrefix: String(t.token || '').slice(0, 12) + '...',
                        deviceId: t.device_id,
                        lastSeen: t.last_seen_at,
                    }))
                    : [],
            },
            pushResult,
            instructions: cfgOk
                ? (iosTokenCount > 0
                    ? 'Test push sent. Check Vercel logs for [APNs] entries.'
                    : 'Config OK but no iOS tokens registered. Open the iOS app and wait for the registration event.')
                : 'Set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 in Vercel Project Settings → Environment Variables.',
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
}
