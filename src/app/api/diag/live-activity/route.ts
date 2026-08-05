import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
// NEEDS ADMIN: `audit_events` é read-only pro cliente; a escrita é do servidor.
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/diag/live-activity — por que a Ilha Dinâmica não nasceu.
 *
 * A Live Activity já reporta ao Sentry (`reportLiveActivityFailure`), e isso
 * resolve para quem TEM o Sentry aberto. Não resolveu aqui: em 04/08/2026 a LA
 * sumiu no iPhone do dono e o diagnóstico travou porque o token do Sentry não
 * existe no repo nem no ambiente local — a pista estava lá e ninguém conseguia
 * ler. `audit_events` é consultável por SQL, não expira, e já é o lugar que este
 * repo usa quando a pergunta precisa de resposta depois (ver o e-mail da Resend
 * no CLAUDE.md).
 *
 * Escopo deliberadamente pequeno: só o START do treino. `update` roda a cada
 * segundo e viraria spam — o que interessa é a activity NASCER.
 */

const BodySchema = z
  .object({
    /** Onde o fluxo morreu. */
    stage: z.enum(['not_native', 'empty_activity_id', 'threw']),
    /** Erro que o Swift devolveu, quando devolveu. */
    nativeError: z.string().max(300).optional(),
    /** `false` = o usuário desligou Atividades ao Vivo nos Ajustes do iOS. */
    activitiesEnabled: z.boolean().optional(),
    /** Diagnóstico do ambiente: ajuda a separar build velha de JS novo. */
    platform: z.string().max(40).optional(),
    appVersion: z.string().max(40).optional(),
    userAgent: z.string().max(300).optional(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    // Um treino gera no máximo um evento; o teto generoso é só anti-abuso.
    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`diag:live-activity:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: true, skipped: 'rate_limited' })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) {
      return parsed.response ?? NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 })
    }
    const body = parsed.data

    const admin = createAdminClient()
    const { error } = await admin.from('audit_events').insert({
      actor_id: userId,
      actor_email: String(auth.user.email || '').slice(0, 200) || null,
      action: 'live_activity_start_failed',
      entity_type: 'live_activity',
      metadata: {
        stage: body.stage,
        nativeError: body.nativeError ?? null,
        activitiesEnabled: body.activitiesEnabled ?? null,
        platform: body.platform ?? null,
        appVersion: body.appVersion ?? null,
        userAgent: body.userAgent ?? null,
      },
    })
    // Falha de telemetria NUNCA vira erro pro app — ele está no meio de um treino.
    if (error) logError('diag:live-activity:insert', error)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    logError('diag:live-activity', e)
    return NextResponse.json({ ok: true })
  }
}
