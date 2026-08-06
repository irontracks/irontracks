import { NextResponse } from 'next/server'
import { z } from 'zod'
// NEEDS ADMIN: `audit_events` é read-only pro cliente, e quem pede recuperação de
// senha por definição NÃO está autenticado.
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/recovery-attempt — registra que ALGUÉM pediu "esqueci a senha".
 *
 * Em 06/08/2026 um aluno pediu o e-mail de recuperação e ele nunca chegou. A
 * investigação mostrou que o Supabase NUNCA foi acionado para a conta dele:
 * `recovery_sent_at` nulo e zero `user_recovery_requested` no histórico — ou
 * seja, o endereço digitado não era o do cadastro. O `resetPasswordForEmail`
 * responde sucesso mesmo para e-mail inexistente (proteção contra enumeração de
 * contas), então nem o usuário nem o dono tinham como saber disso.
 *
 * Esta rota é o registro que faltava. Ela grava em `audit_events` — consultável
 * por SQL, ao contrário do Sentry, que já mostrou não ser lido de onde os
 * problemas são investigados (ver a nota da Live Activity no CLAUDE.md).
 *
 * A resposta é SEMPRE a mesma, e nunca conta se a conta existe: o `matched` vai
 * só para o banco. Do lado de fora, esta rota é indistinguível para um e-mail
 * cadastrado e um inventado — a proteção contra enumeração continua de pé.
 */

const BodySchema = z
  .object({
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.string().email().max(200)),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)
    // Teto generoso: é só anti-abuso. O rate limit que protege o ENVIO é o do
    // Supabase; barrar aqui com força só cegaria o registro.
    const rl = await checkRateLimitAsync(`auth:recovery-attempt:${ip}`, 30, 15 * 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: true })

    const parsed = await parseJsonBody(req, BodySchema)
    // Corpo inválido também não vira erro visível: quem chama isto está no meio
    // de um fluxo de senha e não pode ver a tela quebrar por causa da telemetria.
    if (parsed.response || !parsed.data) return NextResponse.json({ ok: true })
    const email = parsed.data.email

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    const matched = Boolean(profile?.id)

    const { error } = await admin.from('audit_events').insert({
      actor_id: profile?.id ?? null,
      actor_email: email.slice(0, 200),
      action: 'password_recovery_requested',
      entity_type: 'auth',
      metadata: {
        // `false` = o endereço digitado não existe no cadastro. É a resposta para
        // "pedi e não chegou": nunca foi enviado, e agora dá para provar.
        matched,
        ip,
        userAgent: String(req.headers.get('user-agent') || '').slice(0, 300),
      },
    })
    if (error) logError('auth:recovery-attempt:insert', error)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    logError('auth:recovery-attempt', e)
    return NextResponse.json({ ok: true })
  }
}
