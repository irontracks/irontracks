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

    const results = await sendLiveActivityUpdate({
      userId: String(payload.userId),
      kind: 'rest',
      event: 'update',
      contentState: {
        endDate: new Date(Date.now() + 1000).toISOString(),
        targetSeconds: 0,
        isFinished: true,
      },
      alert: {
        title: String(payload.title || 'IronTracks'),
        body: String(payload.body || 'Hora de iniciar a próxima série!'),
      },
    })

    const sent = Array.isArray(results) ? results.filter((r) => (r as { ok?: boolean })?.ok).length : 0
    if (!sent) logWarn('rest:fire', `nenhum token atingido p/ user ${payload.userId}`)
    return NextResponse.json({ ok: true, sent })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
