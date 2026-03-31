import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, resolveRoleByUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { logWarn } from '@/lib/logger'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
    .object({
        id: z.string().min(1),
        token: z.string().optional(),
    })
    .strip()

export async function POST(req: Request) {
    try {
        // Parse body first — we need the token field for fallback auth
        let bodyRaw: Record<string, unknown> = {}
        try { bodyRaw = await req.json() as Record<string, unknown> } catch { /* non-JSON body — will fail validation below */ }
        const parsed = ZodBodySchema.safeParse(bodyRaw)
        if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
        const { id, token: bodyToken } = parsed.data
        if (!id.trim()) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 })

        const admin = createAdminClient()

        // Auth: try cookie → bearer header → body token (mobile fallback)
        let actorId = ''
        let actorEmail: string | null = null
        let actorRole = 'admin'

        const cookieAuth = await requireRole(['admin', 'teacher'])
        if (cookieAuth.ok) {
            actorId = String(cookieAuth.user?.id || '')
            actorEmail = cookieAuth.user?.email ? String(cookieAuth.user.email) : null
            actorRole = String(cookieAuth.role || 'admin')
        } else {
            const headerToken = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
            const tokenToUse = headerToken || String(bodyToken || '').trim()
            if (!tokenToUse) {
                return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
            }
            const { data: userData, error: userErr } = await admin.auth.getUser(tokenToUse)
            if (userErr || !userData?.user?.id) {
                return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
            }
            const { role } = await resolveRoleByUser({ id: userData.user.id, email: userData.user.email })
            if (!['admin', 'teacher'].includes(role)) {
                return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
            }
            actorId = String(userData.user.id)
            actorEmail = userData.user.email ? String(userData.user.email) : null
            actorRole = role
        }

        const ip = getRequestIp(req)
        const rlKey = `admin:student:delete:${actorId}:${ip}`
        const rl = await checkRateLimitAsync(rlKey, 10, 60_000)
        if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

        // Resolve student record — accept student.id or student.user_id
        let studentRow: { id: string; user_id: string | null } | null = null
        try {
            const { data: byId } = await admin.from('students').select('id, user_id').eq('id', id).maybeSingle()
            if (byId?.id) {
                studentRow = { id: String(byId.id), user_id: byId.user_id ? String(byId.user_id) : null }
            } else {
                const { data: byUserId } = await admin.from('students').select('id, user_id').eq('user_id', id).maybeSingle()
                if (byUserId?.id) {
                    studentRow = { id: String(byUserId.id), user_id: byUserId.user_id ? String(byUserId.user_id) : null }
                }
            }
        } catch (e) { logWarn('student-delete', 'Failed to resolve student record', { id, error: getErrorMessage(e) }) }

        if (!studentRow) {
            return NextResponse.json({ ok: false, error: 'Aluno não encontrado.' }, { status: 404 })
        }

        // R2#4: Teachers can only delete their OWN students.
        // Fix: block if teacher_id is NULL (unassigned) — only admins can delete unassigned students.
        if (actorRole === 'teacher' && actorId) {
            const { data: studentFull } = await admin.from('students').select('teacher_id').eq('id', studentRow.id).maybeSingle()
            const teacherId = studentFull?.teacher_id ? String(studentFull.teacher_id) : ''
            if (!teacherId || teacherId !== actorId) {
                return NextResponse.json({ ok: false, error: 'Você não tem permissão para excluir este aluno.' }, { status: 403 })
            }
        }

        // Atomically delete all student data via RPC (single transaction)
        const { data: rpcResult, error: rpcError } = await admin.rpc('delete_student_cascade', {
            p_student_id:  studentRow.id,
            p_actor_id:    actorId || null,
            p_actor_email: actorEmail,
            p_actor_role:  actorRole,
        })

        if (rpcError) {
            const msg = String(rpcError.message || '').trim()
            const lower = msg.toLowerCase()
            if (lower.includes('student_not_found')) {
                return NextResponse.json({ ok: false, error: 'Aluno não encontrado.' }, { status: 404 })
            }
            if (lower.includes('schema cache') || lower.includes('delete_student_cascade')) {
                return NextResponse.json({
                    ok: false,
                    error: 'Função de exclusão não encontrada. Rode a migration 20260401_delete_student_cascade.sql no Supabase.',
                }, { status: 400 })
            }
            return NextResponse.json({ ok: false, error: msg || 'Falha ao excluir aluno.' }, { status: 400 })
        }

        const report = (rpcResult || {}) as { student_id: string; student_user_id: string | null }
        const studentUserId = report.student_user_id || studentRow.user_id

        // Delete auth user — must happen outside Postgres (external auth service)
        let authDeleteWarning = false
        if (studentUserId) {
            try {
                await admin.auth.admin.deleteUser(studentUserId)
            } catch (e) {
                // Student data was already deleted atomically by the RPC.
                // Auth user remains orphaned — admin should be notified.
                logWarn('student-delete', 'auth.users delete failed after cascade', { studentUserId, error: getErrorMessage(e) })
                authDeleteWarning = true
            }
        }

        return NextResponse.json({
            ok: true,
            student_id: studentRow.id,
            student_user_id: studentUserId,
            ...(authDeleteWarning ? { auth_delete_warning: 'Aluno removido do sistema, mas a conta de login pode precisar de exclusão manual.' } : {}),
        })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}
