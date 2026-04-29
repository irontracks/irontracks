import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendPushToUsers } from '@/lib/push/apns'
import { sendPushToAllPlatforms } from '@/lib/push/sender'
import { createAdminClient } from '@/utils/supabase/admin'
import { env } from '@/utils/env'

export const dynamic = 'force-dynamic'

// Sample payloads for every notification type the app fires. Used by
// /api/push/test?type=X so admins can verify how each type renders on the
// lock screen (interruption-level, sound, banner) without having to
// reproduce the trigger conditions in the wild.
const TEST_PAYLOADS: Record<string, { title: string; body: string }> = {
  // Sociais (fan-out)
  message: { title: 'Mensagem direta', body: 'Fulano: oi!' },
  friend_online: { title: 'Amigo online', body: 'Fulano entrou no app.' },
  friend_pr: { title: 'PR batido', body: 'Fulano bateu PR no supino: 100kg.' },
  friend_streak: { title: 'Streak de treino', body: 'Fulano completou 7 dias seguidos.' },
  friend_goal: { title: 'Marco atingido', body: 'Fulano completou 50 treinos.' },
  friend_comeback: { title: 'Voltou aos treinos', body: 'Fulano voltou a treinar depois de 5 dias.' },
  friend_achievement: { title: 'Conquista desbloqueada', body: 'Fulano desbloqueou: 5.000kg levantados.' },
  friend_weekly_goal: { title: 'Meta semanal atingida', body: 'Fulano bateu a meta de 4 treinos nesta semana.' },
  workout_finish: { title: 'Treino finalizado', body: 'Fulano terminou: Peito + Tríceps.' },
  workout_start: { title: 'Treino começou', body: 'Fulano começou o treino agora.' },
  story_posted: { title: 'Novo story', body: 'Fulano postou um story.' },
  story_like: { title: 'Curtiu seu story', body: 'Fulano curtiu seu story.' },
  story_reaction: { title: 'Reação no seu story', body: 'Fulano reagiu com 🔥.' },
  story_comment: { title: 'Novo comentário no seu story', body: 'Fulano: ótimo treino!' },
  mentioned_in_comment: { title: 'Você foi mencionado', body: 'Fulano te mencionou em um comentário.' },
  mentioned_in_chat: { title: 'Você foi mencionado', body: 'Fulano te mencionou no chat de team.' },
  // Self
  pr_close: { title: 'Quase bateu o PR 🔥', body: 'Faltou 2.5kg pro seu PR de supino. Da próxima vez é seu!' },
  birthday: { title: 'Aniversário no IronTracks 🎉', body: 'Você completa 1 ano no app hoje. Continua firme!' },
  streak_at_risk: { title: 'Sua sequência está em risco 🔥', body: 'Você ainda não treinou hoje. Mantém o streak vivo!' },
  inactivity: { title: 'Faz tempo que não te vejo treinar 💪', body: 'Já são 5 dias sem treino. Bora retomar hoje?' },
  morning_briefing: { title: 'Bom dia 🌅', body: 'Hoje é um ótimo dia pra treinar. Vamos?' },
  weekly_recap: { title: 'Resumo da semana 📊', body: 'Você fez 4 treinos na semana passada. Bora pra mais uma!' },
  friends_trained_today: { title: 'Seus amigos estão treinando 💪', body: '3 pessoas que você segue treinaram hoje.' },
  water_reminder: { title: 'Hidratação 💧', body: 'Hora de beber um copo de água.' },
  trial_ending: { title: 'Sua assinatura VIP termina em breve', body: 'Em 24h sua assinatura expira.' },
  billing_issue: { title: 'Falha no pagamento', body: 'Não conseguimos cobrar sua assinatura.' },
}

/**
 * GET /api/push/test
 * Diagnoses the APNs push configuration and sends a real test notification to
 * the currently authenticated user's devices.
 *
 * Optional query params:
 *   ?type=story_comment   → use the sample payload for this type
 *                           (also sets the iOS interruption-level via extra.type)
 *   ?platform=all         → also send via FCM (Android) using sender.ts
 *
 * Returns a JSON summary of what was checked and what happened.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const type = String(url.searchParams.get('type') || '').trim()
  const platform = String(url.searchParams.get('platform') || 'ios').trim()
  const secretParam = url.searchParams.get('secret') ?? ''
  const secretEnv = process.env.PUSH_TEST_SECRET ?? ''
  const secretOk = secretEnv.length > 0 && secretParam === secretEnv

    try {
        const admin = createAdminClient()

        // ── Auth + admin guard ─────────────────────────────────────────────────
        // ?secret=<PUSH_TEST_SECRET> bypasses both session auth and role check —
        // useful when the native-app session cookie isn't present in the browser.
        // Without the secret, requires a Supabase session + profile.role = 'admin'.
        let userId: string
        if (secretOk) {
            // Secret mode: accept optional ?uid=<uuid>, otherwise look up by owner email
            const uidParam = url.searchParams.get('uid') ?? ''
            if (uidParam) {
                userId = uidParam
            } else {
                // Fall back to finding the account by known owner email
                const { data: found } = await admin.auth.admin.listUsers()
                const owner = found?.users?.find((u) => u.email === 'djmkbrasil@gmail.com')
                if (!owner) return NextResponse.json({ ok: false, error: 'Owner user not found — pass ?uid=<uuid>' }, { status: 404 })
                userId = owner.id
            }
        } else {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single()
            if (profile?.role !== 'admin') {
                return NextResponse.json({ ok: false, error: 'Forbidden — admin only' }, { status: 403 })
            }
            userId = user.id
        }

        // ── 1. Check env vars ──────────────────────────────────────────────────
        const cfg = {
            APNS_KEY_ID: Boolean(env.apns.keyId.trim()),
            APNS_TEAM_ID: Boolean(env.apns.teamId.trim()),
            APNS_KEY_P8: Boolean(env.apns.keyP8.trim()),
            APNS_BUNDLE_ID: env.apns.bundleId || '(not set — using com.irontracks.app)',
            APNS_PRODUCTION: env.apns.production,
        }
        const cfgOk = cfg.APNS_KEY_ID && cfg.APNS_TEAM_ID && cfg.APNS_KEY_P8

        // ── 2. Check if this user has registered device tokens ─────────────────
        const { data: tokens, error: tokenErr } = await admin
            .from('device_push_tokens')
            .select('token, platform, device_id, last_seen_at, updated_at')
            .eq('user_id', userId)

        const tokenCount = Array.isArray(tokens) ? tokens.length : 0
        const iosTokenCount = Array.isArray(tokens) ? tokens.filter((t) => String(t.platform || '') === 'ios').length : 0

        // ── 3. Send test push if config is OK ──────────────────────────────────
        const sample = type && TEST_PAYLOADS[type] ? TEST_PAYLOADS[type] : null
        const title = sample?.title ?? '🔔 IronTracks — Notificação de Teste'
        const body = sample?.body ?? 'Se você está vendo isso, as push notifications estão funcionando!'
        const extra = type ? { type } : undefined

        let pushResult: unknown = 'skipped — APNs config missing or no iOS tokens'
        if (cfgOk && iosTokenCount > 0) {
            const delivery = platform === 'all'
                ? await sendPushToAllPlatforms([userId], title, body, extra, { bypassMasterSwitch: true })
                : await sendPushToUsers([userId], title, body, extra)
            pushResult = {
                sent: true,
                type: type || '(generic)',
                summary: `Attempted delivery to ${iosTokenCount} iOS device(s)${platform === 'all' ? ' + Android' : ''}`,
                details: delivery.map((d) => ({
                    token: d.token.slice(0, 12) + '...',
                    status: d.ok ? '✅ OK' : '❌ FAILED',
                    error: d.error ?? null,
                })),
            }
        }

        return NextResponse.json({
            ok: true,
            userId,
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
            availableTypes: Object.keys(TEST_PAYLOADS),
            usage: 'Add ?type=<one_of_availableTypes> to test a specific notification template. Add &platform=all to also push to Android.',
        })
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ ok: false, error: msg }, { status: 500 })
    }
}
