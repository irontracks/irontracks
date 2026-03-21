import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer, resolveRoleByUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { logWarn } from '@/lib/logger'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { safePg } from '@/utils/safePgFilter'

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
            // Try bearer header
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

        // R2#4: Teachers can only delete their own students
        if (actorRole === 'teacher' && actorId) {
            const { data: studentFull } = await admin.from('students').select('teacher_id').eq('id', studentRow.id).maybeSingle()
            const teacherId = studentFull?.teacher_id ? String(studentFull.teacher_id) : ''
            if (teacherId && teacherId !== actorId) {
                return NextResponse.json({ ok: false, error: 'Você não tem permissão para excluir alunos de outro professor.' }, { status: 403 })
            }
        }

        const studentUserId = studentRow.user_id

        // Delete cascade — log errors instead of silently swallowing them
        const ctx = { studentId: studentRow.id, studentUserId }
        if (studentUserId) {
            try { await admin.from('workout_checkins').delete().eq('user_id', studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete workout_checkins', { ...ctx, error: getErrorMessage(e) }) }
            try { await admin.from('exercise_execution_submissions').delete().eq('student_user_id', studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete execution_submissions', { ...ctx, error: getErrorMessage(e) }) }

            const assessmentIds: string[] = []
            try {
                const { data: assessments } = await admin.from('assessments').select('id').eq('student_id', studentUserId)
                if (Array.isArray(assessments)) assessmentIds.push(...assessments.map((a: { id: string }) => a.id))
            } catch (e) { logWarn('student-delete', 'Failed to fetch assessments', { ...ctx, error: getErrorMessage(e) }) }
            if (assessmentIds.length > 0) {
                try { await admin.from('assessment_photos').delete().in('assessment_id', assessmentIds) } catch (e) { logWarn('student-delete', 'Failed to delete assessment_photos', { ...ctx, error: getErrorMessage(e) }) }
            }
            try { await admin.from('assessments').delete().eq('student_id', studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete assessments', { ...ctx, error: getErrorMessage(e) }) }

            const workoutIds: string[] = []
            try {
                const { data: workouts } = await admin.from('workouts').select('id').eq('user_id', studentUserId)
                if (Array.isArray(workouts)) workoutIds.push(...workouts.map((w: { id: string }) => w.id))
            } catch (e) { logWarn('student-delete', 'Failed to fetch workouts', { ...ctx, error: getErrorMessage(e) }) }
            if (workoutIds.length > 0) {
                const exerciseIds: string[] = []
                try {
                    const { data: exercises } = await admin.from('exercises').select('id').in('workout_id', workoutIds)
                    if (Array.isArray(exercises)) exerciseIds.push(...exercises.map((e: { id: string }) => e.id))
                } catch (e) { logWarn('student-delete', 'Failed to fetch exercises', { ...ctx, error: getErrorMessage(e) }) }
                if (exerciseIds.length > 0) {
                    try { await admin.from('sets').delete().in('exercise_id', exerciseIds) } catch (e) { logWarn('student-delete', 'Failed to delete sets', { ...ctx, error: getErrorMessage(e) }) }
                    try { await admin.from('exercises').delete().in('id', exerciseIds) } catch (e) { logWarn('student-delete', 'Failed to delete exercises', { ...ctx, error: getErrorMessage(e) }) }
                }
                try { await admin.from('workouts').delete().in('id', workoutIds) } catch (e) { logWarn('student-delete', 'Failed to delete workouts', { ...ctx, error: getErrorMessage(e) }) }
            }

            try { await admin.from('notifications').delete().eq('user_id', studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete notifications', { ...ctx, error: getErrorMessage(e) }) }
            try { await admin.from('user_settings').delete().eq('user_id', studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete user_settings', { ...ctx, error: getErrorMessage(e) }) }
            try { await admin.from('active_workout_sessions').delete().eq('user_id', studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete active_workout_sessions', { ...ctx, error: getErrorMessage(e) }) }
            try {
                const safeUserId = safePg(String(studentUserId))
                const { data: channels } = await admin.from('direct_channels').select('id').or(`user1_id.eq.${safeUserId},user2_id.eq.${safeUserId}`)
                if (Array.isArray(channels) && channels.length > 0) {
                    const ids = channels.map((c: { id: string }) => c.id)
                    try { await admin.from('direct_messages').delete().in('channel_id', ids) } catch (e) { logWarn('student-delete', 'Failed to delete direct_messages', { ...ctx, error: getErrorMessage(e) }) }
                    try { await admin.from('direct_channels').delete().in('id', ids) } catch (e) { logWarn('student-delete', 'Failed to delete direct_channels', { ...ctx, error: getErrorMessage(e) }) }
                }
            } catch (e) { logWarn('student-delete', 'Failed to delete direct channels', { ...ctx, error: getErrorMessage(e) }) }
        }

        // Delete the student record
        const { error: deleteError } = await admin.from('students').delete().eq('id', studentRow.id)
        if (deleteError) {
            return NextResponse.json({ ok: false, error: String(deleteError.message || 'Falha ao excluir') }, { status: 400 })
        }

        // Audit log
        try {
            await admin.from('audit_events').insert({
                actor_id: actorId || null,
                actor_email: actorEmail,
                actor_role: actorRole,
                action: 'delete_student',
                entity_type: 'student',
                entity_id: studentRow.id,
                metadata: { student_user_id: studentUserId },
            })
        } catch (e) { logWarn('student-delete', 'Failed to write audit log', { ...ctx, error: getErrorMessage(e) }) }

        // Delete from auth.users
        if (studentUserId) {
            try { await admin.auth.admin.deleteUser(studentUserId) } catch (e) { logWarn('student-delete', 'Failed to delete auth user', { ...ctx, error: getErrorMessage(e) }) }
        }

        return NextResponse.json({ ok: true, student_id: studentRow.id, student_user_id: studentUserId })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}
