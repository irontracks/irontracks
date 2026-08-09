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
 * POST /api/diag/iron-rank — por que o volume total veio zerado.
 *
 * O card mostrava "0kg levantados · Iniciante do Ferro" para uma conta com
 * 2.427.394 kg e 127 treinos. A instrumentação de 09/08/2026 (#716) mandou o
 * sinal ao Sentry, e isso resolve para quem TEM o Sentry aberto — mas o token
 * não existe no repo nem no ambiente local, então a pista fica ilegível de onde
 * o problema é investigado. Foi exatamente o que aconteceu com a Live Activity
 * em 04/08, e a solução aqui é a mesma: `audit_events` responde a um SELECT,
 * não expira, e é o lugar que este repo usa quando a pergunta precisa de
 * resposta depois.
 *
 * A causa provável já tem nome: `iron_rank_my_total_volume` faz
 * `RAISE EXCEPTION 'not_authenticated'` quando `auth.uid()` vem NULL, e o
 * supabase-js entrega isso no RETORNO, não como exceção. O `code` gravado aqui
 * confirma ou derruba essa hipótese sem depender de reproduzir.
 *
 * Consulta:
 *   select created_at, metadata->>'stage', metadata->>'code',
 *          metadata->>'message', metadata->>'totalWorkouts'
 *     from audit_events where action = 'iron_rank_volume_failed'
 *    order by created_at desc limit 20;
 *
 * Escopo pequeno de propósito: só a FALHA. O caminho feliz roda a cada visita
 * ao dashboard e viraria ruído — o que interessa é o volume não chegar.
 */

const BodySchema = z
    .object({
        /**
         * `rpc_error` = o RPC devolveu erro (é aqui que `not_authenticated` cai).
         * `zero_com_historico` = o RPC respondeu 0 para quem tem treinos, o que
         * é contradição: ou ele regrediu, ou o parse comeu o número.
         */
        stage: z.enum(['rpc_error', 'zero_com_historico']),
        /** Código do Postgres/PostgREST — responde a hipótese sozinho. */
        code: z.string().max(60).optional(),
        message: z.string().max(300).optional(),
        /** Se for 0, não há contradição nenhuma: a conta é nova mesmo. */
        totalWorkouts: z.number().int().min(0).max(100_000).optional(),
        /** O valor cru que voltou, para separar erro de RPC de erro de parse. */
        raw: z.string().max(120).optional(),
        platform: z.string().max(40).optional(),
    })
    .strict()

export async function POST(req: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        // O dashboard pode ser reaberto várias vezes; o teto é só anti-abuso.
        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`diag:iron-rank:${userId}:${ip}`, 20, 60_000)
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
            action: 'iron_rank_volume_failed',
            entity_type: 'iron_rank',
            metadata: {
                stage: body.stage,
                code: body.code ?? null,
                message: body.message ?? null,
                totalWorkouts: body.totalWorkouts ?? null,
                raw: body.raw ?? null,
                platform: body.platform ?? null,
            },
        })
        // Telemetria NUNCA vira erro pro app: o usuário só quer ver o rank.
        if (error) logError('diag:iron-rank:insert', error)

        return NextResponse.json({ ok: true })
    } catch (e: unknown) {
        logError('diag:iron-rank', e)
        return NextResponse.json({ ok: true })
    }
}
