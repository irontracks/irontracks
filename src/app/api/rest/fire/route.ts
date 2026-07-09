/**
 * POST /api/rest/fire  (webhook do QStash)
 *
 * Disparado pelo QStash no `endDate` do descanso (agendado por
 * /api/rest/schedule-push). Verifica a assinatura do QStash e então envia um
 * push remoto que (a) ACORDA o celular (alert) e (b) finaliza a Live Activity
 * (isFinished) — resolvendo o spinner travado e o "não acorda" quando o app
 * está bloqueado.
 */
import { NextResponse } from 'next/server'
import { Receiver } from '@upstash/qstash'
import { env } from '@/utils/env'
import { sendLiveActivityUpdate } from '@/lib/push/apnsLiveActivity'
import { sendPushToAllPlatforms } from '@/lib/push/sender'
import { logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const currentSigningKey = String(env.qstash.currentSigningKey || '').trim()
    const nextSigningKey = String(env.qstash.nextSigningKey || '').trim()
    if (!currentSigningKey) {
      return NextResponse.json({ ok: false, error: 'qstash_not_configured' }, { status: 503 })
    }

    const raw = await req.text()
    const signature = req.headers.get('upstash-signature') || ''
    const receiver = new Receiver({ currentSigningKey, nextSigningKey })
    const valid = await receiver.verify({ signature, body: raw }).catch(() => false)
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
    }

    let payload: { userId?: string; kind?: string; title?: string; body?: string }
    try { payload = JSON.parse(raw || '{}') } catch { payload = {} }
    if (!payload.userId) {
      return NextResponse.json({ ok: false, error: 'missing_user' }, { status: 400 })
    }

    const userId = String(payload.userId)
    const title = String(payload.title || 'Descanso encerrado')
    const body = String(payload.body || 'Hora de iniciar a próxima série!')

    // (a) Alert push REAL — MESMO caminho dos DMs (que acordam a tela). O update
    //     de Live Activity sozinho não acende a tela bloqueada; este push sim:
    //     type 'rest_timer' entra em WAKE_SCREEN_TYPES → mutable-content:1 +
    //     interruption-level time-sensitive → Communication Notification (wake +
    //     som no bloqueado, igual WhatsApp). sender_id/conversation_id estáveis
    //     por usuário pro iOS não rebaixar como spam.
    const [pushResults, laResults] = await Promise.all([
      sendPushToAllPlatforms([userId], title, body, {
        type: 'rest_timer',
        sender_name: 'Descanso',
        sender_id: `irontracks-rest-${userId}`,
        conversation_id: `irontracks-rest-${userId}`,
      }).catch(() => []),
      // (b) Finaliza a Live Activity (encerra o spinner do descanso).
      sendLiveActivityUpdate({
        userId,
        kind: 'rest',
        event: 'update',
        contentState: {
          endDate: new Date(Date.now() + 1000).toISOString(),
          targetSeconds: 0,
          isFinished: true,
        },
        alert: { title, body },
      }).catch(() => []),
    ])

    const okCount = (arr: unknown) => (Array.isArray(arr) ? arr.filter((r) => (r as { ok?: boolean })?.ok).length : 0)
    const sent = okCount(pushResults) + okCount(laResults)
    if (!sent) logWarn('rest:fire', `nenhum token atingido p/ user ${userId}`)
    return NextResponse.json({ ok: true, sent, push: okCount(pushResults), liveActivity: okCount(laResults) })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
