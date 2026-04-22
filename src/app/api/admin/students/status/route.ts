import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { safePgLike } from '@/utils/safePgFilter'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    // Optional fallback identifier. When the admin panel's AdminUser was
    // built from the profiles fallback (no `students` row yet), `id` is a
    // profile UUID and won't match `students.id`. If the client forwards
    // the email we can resolve by email, mirroring assign-teacher/route.ts.
    email: z.string().optional(),
  })
  .strip()

// ─── Push messages by status ────────────────────────────────────────────────

const STATUS_PUSH: Record<string, { title: string; body: string } | null> = {
  pago: {
    title: '✅ Pagamento confirmado!',
    body: 'Seu acesso ao IronTracks está ativo. Boas sessões de treino! 💪',
  },
  pendente: {
    title: '⏳ Pagamento pendente',
    body: 'Seu pagamento ainda não foi confirmado. Entre em contato com seu professor.',
  },
  atrasado: {
    title: '⚠️ Pagamento em atraso',
    body: 'Seu pagamento está atrasado. Regularize para continuar aproveitando o IronTracks.',
  },
  cancelar: {
    title: '❌ Acesso encerrado',
    body: 'Sua assinatura foi cancelada. Fale com seu professor para reativar.',
  },
}

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: Record<string, unknown> = parsedBody.data!
    const id = String(body?.id || '').trim()
    const status = String(body?.status || '').trim()
    const email = String(body?.email || '').trim()
    if (!id || !status) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const admin = createAdminClient()

    // Resolve the real students row. The caller may send `id` as either:
    //   - students.id (the row PK) — happens when AdminUser came from the
    //     /api/admin/students/list endpoint.
    //   - profiles.id / auth uid  — happens when AdminUser was built from
    //     the profiles fallback before a real `students` row existed.
    // `email` is an optional last-resort identifier for the second case.
    const SELECT_COLS = 'id, user_id, teacher_id, email, name, status'

    const tryFind = async (column: 'id' | 'user_id', value: string) => {
      const { data } = await admin.from('students').select(SELECT_COLS).eq(column, value).maybeSingle()
      return data as Record<string, unknown> | null
    }
    const tryFindByEmail = async (value: string) => {
      const { data } = await admin.from('students').select(SELECT_COLS).ilike('email', safePgLike(value)).maybeSingle()
      return data as Record<string, unknown> | null
    }

    const studentRow: Record<string, unknown> | null =
      (await tryFind('id', id))
      ?? (await tryFind('user_id', id))
      ?? (email ? await tryFindByEmail(email) : null)

    if (!studentRow) return NextResponse.json({ ok: false, error: 'student_not_found' }, { status: 404 })

    const resolvedId = String(studentRow.id || '')
    const resolvedTeacher = String(studentRow.teacher_id || '')
    const resolvedUserId = String(studentRow.user_id || '').trim()
    const prevStatus = String(studentRow.status || '')

    // Only admin or the student's responsible teacher
    if (auth.role !== 'admin') {
      if (resolvedTeacher !== auth.user.id) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
    }

    // Update status — always by the resolved PK so we don't accidentally
    // update 0 rows when the caller sent a profile UUID as `id`.
    const { error } = await admin.from('students').update({ status }).eq('id', resolvedId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    // Fire push notification if status changed and student has a linked account
    const pushMsg = STATUS_PUSH[status] ?? null
    if (pushMsg && resolvedUserId && status !== prevStatus) {
      // Fire-and-forget — don't block the response
      sendPushToUsers([resolvedUserId], pushMsg.title, pushMsg.body, {
        type: 'student_status_change',
        newStatus: status,
      }).catch(() => { /* silent */ })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
