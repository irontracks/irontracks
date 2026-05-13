import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer, resolveRoleByUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { logError } from '@/lib/logger'
import { env } from '@/utils/env'

const BodySchema = z.object({
    user_id: z.string().trim().min(1, 'user_id required'),
    token: z.string().trim().min(1).optional(),
})

export const dynamic = 'force-dynamic'

/**
 * Deleta um usuário de auth.users (cascata via FKs).
 *
 * SEGURANÇA (audit Finding #1 — privilege escalation):
 *   Antes este endpoint aceitava qualquer caller com role 'admin' OU 'teacher',
 *   ou qualquer linha em `teachers`. Resultado: qualquer teacher podia deletar
 *   QUALQUER usuário (incluindo admin, outros teachers, alunos não-seus).
 *
 *   AGORA: APENAS admin pode usar esta primitiva. Pra "teacher deletar aluno
 *   próprio" existe `/api/admin/students/delete` que valida `students.teacher_id`.
 *
 *   Cadeia de auth (compat com chamadas via Capacitor / sem cookies):
 *     1. Cookie auth via `requireRole(['admin'])`
 *     2. Fallback Bearer header
 *     3. Fallback body.token
 *
 * Expects: POST { user_id: string, token?: string }
 */
export async function POST(req: Request) {
    try {
        const raw = await req.json().catch(() => ({}))
        const parsed = BodySchema.safeParse(raw)
        if (!parsed.success) {
            const msg = parsed.error.issues.map(i => i.message).join(', ')
            return NextResponse.json({ ok: false, error: msg }, { status: 400 })
        }
        const { user_id: userId, token } = parsed.data

        const admin = createAdminClient()

        // ─── Auth (admin-only) ───────────────────────────────────────────────
        // Caminho 1: cookie + bearer header. Caminho 2 (fallback Capacitor antigo):
        // body.token. Restringimos a `role === 'admin'` — caso "teacher deleta
        // aluno próprio" passa por /api/admin/students/delete (validação dedicada).
        let callerId = ''
        let callerEmail = ''
        let role = ''

        const primaryAuth = await requireRoleOrBearer(req, ['admin'])
        if (primaryAuth.ok) {
            callerId = String(primaryAuth.user?.id || '')
            callerEmail = primaryAuth.user?.email ? String(primaryAuth.user.email).toLowerCase() : ''
            role = String(primaryAuth.role || '').toLowerCase()
        } else if (token) {
            // Fallback body.token (compat com chamadas antigas do mobile que não
            // setam Authorization header).
            const { data: caller, error: callerErr } = await admin.auth.getUser(token)
            if (callerErr || !caller?.user?.id) {
                return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 })
            }
            callerId = caller.user.id
            callerEmail = String(caller.user.email || '').toLowerCase()
            const resolved = await resolveRoleByUser({ id: callerId, email: caller.user.email })
            role = String(resolved.role || '').toLowerCase()
        } else {
            return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
        }

        // Verificação final de role (defesa em profundidade — requireRoleOrBearer
        // já valida, mas o fallback body.token só fez getUser sem checar role).
        const envAdminEmail = env.security.adminEmail.trim().toLowerCase()
        const isAdmin = role === 'admin' || (envAdminEmail !== '' && callerEmail === envAdminEmail)
        if (!isAdmin) {
            return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }

        // Não permite deletar a si mesmo
        if (userId === callerId) {
            return NextResponse.json({ ok: false, error: 'cannot delete yourself' }, { status: 400 })
        }

        // ─── Executa ─────────────────────────────────────────────────────────
        const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
        if (deleteErr) {
            return NextResponse.json({ ok: false, error: String(deleteErr.message || 'failed') }, { status: 400 })
        }

        return NextResponse.json({ ok: true })
    } catch (e: unknown) {
        logError('api:admin:delete-auth-user', e)
        // Erro genérico em prod (audit Finding #10) — detalhes só no logger.
        return NextResponse.json(
            { ok: false, error: process.env.NODE_ENV === 'development' ? getErrorMessage(e) : 'internal' },
            { status: 500 },
        )
    }
}
