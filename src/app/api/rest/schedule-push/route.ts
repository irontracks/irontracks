/**
 * POST /api/rest/schedule-push
 *
 * Chamado pelo cliente quando o app vai pro background COM um descanso ativo.
 * Agenda (via QStash) um push de fim de descanso para o `endMs`. Retorna o
 * `scheduleId` que o cliente guarda para cancelar ao voltar/terminar.
 *
 * Body: { activityId: string, endMs: number, title?: string, body?: string }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseJsonBody } from '@/utils/zod'
import { scheduleRestEndPush } from '@/lib/push/restEndScheduler'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { cacheSet } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  activityId: z.string().min(1),
  endMs: z.number(),
  title: z.string().optional(),
  body: z.string().optional(),
}).passthrough()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`rest:schedule:${user.id}:${ip}`, 60, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const b = parsed.data as z.infer<typeof BodySchema>

    // +2s de margem: se o app voltar ao foreground ele finaliza a LA e cancela
    // este agendamento antes do disparo, evitando push/alerta duplicado.
    const delaySec = Math.round((Number(b.endMs) - Date.now()) / 1000) + 2
    if (!Number.isFinite(delaySec) || delaySec < 3 || delaySec > 900) {
      return NextResponse.json({ ok: false, error: 'invalid_delay' }, { status: 400 })
    }

    const scheduleId = await scheduleRestEndPush(
      {
        userId: user.id,
        activityId: String(b.activityId),
        kind: 'rest',
        title: String(b.title || 'IronTracks'),
        body: String(b.body || 'Hora de iniciar a próxima série!'),
      },
      delaySec,
    )

    if (!scheduleId) {
      // QStash não configurado ou falhou — degrada suave (notificação local
      // segue como fallback). Não é erro fatal pro cliente.
      return NextResponse.json({ ok: true, scheduleId: null, deferred: true })
    }
    // Mapping scheduleId→userId para validar ownership no cancel-push (auditoria
    // 2026-06-27, L8). TTL cobre a janela do descanso (+2min de folga).
    try { await cacheSet(`rest:push:owner:${scheduleId}`, user.id, delaySec + 120) } catch { /* cache best-effort */ }
    return NextResponse.json({ ok: true, scheduleId })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
