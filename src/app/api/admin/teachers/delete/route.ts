import { NextResponse } from 'next/server'
import { logWarn } from '@/lib/logger'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    // Auth first (before consuming request body)
    // Accept both admin and teacher roles — the admin panel already gates access
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) {
        // Return descriptive error for debugging
        const hasBearer = !!(req.headers.get('authorization') || '').trim()
        return NextResponse.json(
          { ok: false, error: hasBearer ? 'Unauthorized: token inválido ou role insuficiente' : 'Unauthorized: token não fornecido' },
          { status: 401 }
        )
      }
    }

    // actorId must be a valid UUID or null — never an empty string (causes Postgres UUID cast error)
    const actorId = String(auth.user?.id || '').trim() || null
    const actorEmail = auth.user?.email ? String(auth.user.email).trim() : null
    const actorRole = String(auth.role || 'admin')

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const admin = createAdminClient()

    let resolvedTeacherId = id
    let teacherUserId: string | null = null
    try {
      const { data: byTeacherId } = await admin.from('teachers').select('id, user_id').eq('id', resolvedTeacherId).maybeSingle()
      if (!byTeacherId?.id) {
        const { data: byUserId } = await admin.from('teachers').select('id, user_id').eq('user_id', resolvedTeacherId).maybeSingle()
        if (byUserId?.id) {
          resolvedTeacherId = String(byUserId.id)
          teacherUserId = byUserId.user_id ? String(byUserId.user_id) : null
        }
      } else {
        teacherUserId = byTeacherId.user_id ? String(byTeacherId.user_id) : null
      }
    } catch (e) { logWarn('admin:teachers:delete', 'silenced', e) }

    const { data, error } = await admin.rpc('delete_teacher_cascade', {
      p_teacher_id: resolvedTeacherId,
      p_actor_id:   actorId,
      p_actor_email: actorEmail,
      p_actor_role:  actorRole,
    })

    if (error) {
      const msg = String(error.message || '').trim()
      const lower = msg.toLowerCase()
      if (lower.includes('schema cache') || lower.includes('delete_teacher_cascade')) {
        return NextResponse.json({ ok: false, error: 'Função de exclusão não encontrada. Rode a migration 20260213120000_delete_teacher_cascade.sql no Supabase e tente novamente.' }, { status: 400 })
      }
      return NextResponse.json({ ok: false, error: msg || 'Falha ao excluir' }, { status: 400 })
    }

    // Resolve teacher user_id from the RPC result if not already found
    const reportData = data as Record<string, unknown> | null
    const resolvedUserId = teacherUserId || (reportData?.teacher_user_id ? String(reportData.teacher_user_id) : null)

    // Delete the user from auth.users so they can't log back in
    if (resolvedUserId) {
      try {
        await admin.auth.admin.deleteUser(resolvedUserId)
      } catch {
        // auth.users deletion failed — cascade SQL already removed all application data
      }
    }

    return NextResponse.json({ ok: true, report: data ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
