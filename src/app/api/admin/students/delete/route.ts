import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer, resolveRoleByUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

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
        try { bodyRaw = await req.json() as Record<string, unknown> } catch { }
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
                return NextResponse.json({ ok: false, error: 'Não autenticado: token ausente' }, { status: 401 })
            }
            const { data: userData, error: userErr } = await admin.auth.getUser(tokenToUse)
            if (userErr || !userData?.user?.id) {
                return NextResponse.json({ ok: false, error: 'Não autenticado: token inválido' }, { status: 401 })
            }
            const { role } = await resolveRoleByUser({ id: userData.user.id, email: userData.user.email })
            if (!['admin', 'teacher'].includes(role)) {
                return NextResponse.json({ ok: false, error: 'Acesso negado: role=' + role }, { status: 403 })
            }
            actorId = String(userData.user.id)
            actorEmail = userData.user.email ? String(userData.user.email) : null
            actorRole = role
        }

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
        } catch { }

        if (!studentRow) {
            return NextResponse.json({ ok: false, error: 'Aluno não encontrado.' }, { status: 404 })
        }

        const studentUserId = studentRow.user_id

        // Delete cascade
        if (studentUserId) {
            try { await admin.from('workout_checkins').delete().eq('user_id', studentUserId) } catch { }
            try { await admin.from('exercise_execution_submissions').delete().eq('student_user_id', studentUserId) } catch { }

            const assessmentIds: string[] = []
            try {
                const { data: assessments } = await admin.from('assessments').select('id').eq('student_id', studentUserId)
                if (Array.isArray(assessments)) assessmentIds.push(...assessments.map((a: { id: string }) => a.id))
            } catch { }
            if (assessmentIds.length > 0) {
                try { await admin.from('assessment_photos').delete().in('assessment_id', assessmentIds) } catch { }
            }
            try { await admin.from('assessments').delete().eq('student_id', studentUserId) } catch { }

            const workoutIds: string[] = []
            try {
                const { data: workouts } = await admin.from('workouts').select('id').eq('user_id', studentUserId)
                if (Array.isArray(workouts)) workoutIds.push(...workouts.map((w: { id: string }) => w.id))
            } catch { }
            if (workoutIds.length > 0) {
                const exerciseIds: string[] = []
                try {
                    const { data: exercises } = await admin.from('exercises').select('id').in('workout_id', workoutIds)
                    if (Array.isArray(exercises)) exerciseIds.push(...exercises.map((e: { id: string }) => e.id))
                } catch { }
                if (exerciseIds.length > 0) {
                    try { await admin.from('sets').delete().in('exercise_id', exerciseIds) } catch { }
                    try { await admin.from('exercises').delete().in('id', exerciseIds) } catch { }
                }
                try { await admin.from('workouts').delete().in('id', workoutIds) } catch { }
            }

            try { await admin.from('notifications').delete().eq('user_id', studentUserId) } catch { }
            try { await admin.from('user_settings').delete().eq('user_id', studentUserId) } catch { }
            try { await admin.from('active_workout_sessions').delete().eq('user_id', studentUserId) } catch { }
            try {
                const { data: channels } = await admin.from('direct_channels').select('id').or(`user1_id.eq.${studentUserId},user2_id.eq.${studentUserId}`)
                if (Array.isArray(channels) && channels.length > 0) {
                    const ids = channels.map((c: { id: string }) => c.id)
                    try { await admin.from('direct_messages').delete().in('channel_id', ids) } catch { }
                    try { await admin.from('direct_channels').delete().in('id', ids) } catch { }
                }
            } catch { }
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
        } catch { }

        // Delete from auth.users
        if (studentUserId) {
            try { await admin.auth.admin.deleteUser(studentUserId) } catch { }
        }

        return NextResponse.json({ ok: true, student_id: studentRow.id, student_user_id: studentUserId })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}
