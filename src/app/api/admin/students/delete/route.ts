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

type StudentStorageObject = {
    bucket_id: string
    name: string
}

type StudentDeletionPlan = {
    student_id?: string
    student_user_id?: string | null
    storage_objects?: unknown
}

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

        // Storage precisa ser removido antes de auth.users: o Supabase bloqueia a
        // exclusão de um usuário que ainda seja dono de objetos.
        const { data: planResult, error: planError } = await admin.rpc('get_student_deletion_plan', {
            p_student_id: studentRow.id,
        })

        if (planError) {
            const msg = String(planError.message || '').trim()
            const lower = msg.toLowerCase()
            if (lower.includes('student_not_found')) {
                return NextResponse.json({ ok: false, error: 'Aluno não encontrado.' }, { status: 404 })
            }
            if (lower.includes('schema cache') || lower.includes('get_student_deletion_plan')) {
                return NextResponse.json({
                    ok: false,
                    error: 'Função de exclusão desatualizada. Aplique a migration de exclusão completa de alunos.',
                }, { status: 500 })
            }
            return NextResponse.json({ ok: false, error: msg || 'Falha ao preparar exclusão do aluno.' }, { status: 500 })
        }

        const plan = (planResult || {}) as StudentDeletionPlan
        const plannedUserId = plan.student_user_id ? String(plan.student_user_id) : null
        if (plannedUserId !== studentRow.user_id) {
            logWarn('student-delete', 'Deletion plan returned a different user id', {
                studentId: studentRow.id,
                expectedUserId: studentRow.user_id,
                plannedUserId,
            })
            return NextResponse.json({ ok: false, error: 'Falha de consistência ao preparar exclusão.' }, { status: 500 })
        }

        const storageObjects: StudentStorageObject[] = Array.isArray(plan.storage_objects)
            ? plan.storage_objects.flatMap((item) => {
                if (!item || typeof item !== 'object') return []
                const row = item as Record<string, unknown>
                const bucketId = String(row.bucket_id || '').trim()
                const name = String(row.name || '').trim()
                return bucketId && name ? [{ bucket_id: bucketId, name }] : []
            })
            : []

        // error_reports usa ON DELETE RESTRICT e precisa sair antes de auth.users.
        if (plannedUserId) {
            const { error: blockingRowsError } = await admin
                .from('error_reports')
                .delete()
                .eq('user_id', plannedUserId)
            if (blockingRowsError) {
                logWarn('student-delete', 'Failed to remove auth deletion blockers', {
                    studentId: studentRow.id,
                    error: blockingRowsError.message,
                })
                return NextResponse.json({ ok: false, error: 'Falha ao preparar dados vinculados ao aluno.' }, { status: 500 })
            }
        }

        const pathsByBucket = new Map<string, string[]>()
        for (const item of storageObjects) {
            const paths = pathsByBucket.get(item.bucket_id) || []
            paths.push(item.name)
            pathsByBucket.set(item.bucket_id, paths)
        }

        for (const [bucketId, paths] of pathsByBucket) {
            const uniquePaths = Array.from(new Set(paths))
            for (let index = 0; index < uniquePaths.length; index += 100) {
                const chunk = uniquePaths.slice(index, index + 100)
                const { error: storageError } = await admin.storage.from(bucketId).remove(chunk)
                if (storageError) {
                    logWarn('student-delete', 'Failed to remove student storage objects', {
                        studentId: studentRow.id,
                        bucketId,
                        error: storageError.message,
                    })
                    return NextResponse.json({ ok: false, error: 'Falha ao excluir arquivos do aluno.' }, { status: 502 })
                }
            }
        }

        // A conta Auth vem antes da limpeza final. Se a RPC final falhar, a linha
        // students permanece e a operação pode ser repetida com segurança.
        if (plannedUserId) {
            const { error: authDeleteError } = await admin.auth.admin.deleteUser(plannedUserId)
            if (authDeleteError && authDeleteError.status !== 404) {
                logWarn('student-delete', 'auth.users delete failed', {
                    studentId: studentRow.id,
                    studentUserId: plannedUserId,
                    error: authDeleteError.message,
                })
                return NextResponse.json({ ok: false, error: 'Falha ao excluir a conta de login do aluno.' }, { status: 502 })
            }
        }

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
            if (lower.includes('auth_user_still_exists')) {
                return NextResponse.json({ ok: false, error: 'A conta de login do aluno ainda existe.' }, { status: 502 })
            }
            if (lower.includes('schema cache') || lower.includes('delete_student_cascade')) {
                return NextResponse.json({
                    ok: false,
                    error: 'Função de exclusão desatualizada. Aplique a migration de exclusão completa de alunos.',
                }, { status: 500 })
            }
            logWarn('student-delete', 'Final database cleanup failed after auth deletion', {
                studentId: studentRow.id,
                studentUserId: plannedUserId,
                error: msg,
            })
            return NextResponse.json({
                ok: false,
                error: 'Conta removida, mas a limpeza final falhou. Tente excluir o aluno novamente.',
            }, { status: 500 })
        }

        const report = (rpcResult || {}) as { student_id: string; student_user_id: string | null }
        const studentUserId = report.student_user_id || plannedUserId

        return NextResponse.json({
            ok: true,
            student_id: studentRow.id,
            student_user_id: studentUserId,
            storage_objects_deleted: storageObjects.length,
        })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}
