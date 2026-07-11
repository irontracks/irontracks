import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'
import { resolveStudentRow } from '@/utils/admin/resolveStudent'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'
import { waitUntil } from '@vercel/functions'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    // Allowlist de status conhecidos (auditoria 2026-06-28, R2): antes era string
    // livre, deixando um teacher gravar qualquer valor em students.status. Cobre os
    // valores em uso no banco (pago/ativo) + os que disparam push (pendente/atrasado/cancelar).
    status: z.enum(['pago', 'ativo', 'pendente', 'atrasado', 'cancelar']),
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

    // Resolve the real students row. Supports both real students (AdminUser.id =
    // students.id) and "pending" profiles (AdminUser.id = "pending_<profile.id>").
    // autoCreate SÓ para admin: um professor passando o id/email de um profile que NÃO é
    // aluno dele materializava uma linha `students` órfã ANTES do check de ownership abaixo
    // (efeito colateral de dados / DoS leve). Para teacher, resolve sem criar → 404 se não
    // existe; se existe mas é de outro professor, o guard de ownership retorna 403.
    const studentRow = await resolveStudentRow(admin, { id, email, autoCreate: auth.role === 'admin' })
    if (!studentRow) return NextResponse.json({ ok: false, error: 'student_not_found' }, { status: 404 })

    const resolvedId = studentRow.id
    const resolvedTeacher = studentRow.teacher_id ?? ''
    const resolvedUserId = studentRow.user_id ?? ''
    const prevStatus = studentRow.status ?? ''

    // Only admin or the student's responsible teacher
    if (auth.role !== 'admin') {
      if (resolvedTeacher !== auth.user.id) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
    }

    // Update status — always by the resolved PK so we don't accidentally
    // update 0 rows when the caller sent a profile UUID as `id`.
    const { error } = await admin.from('students').update({ status }).eq('id', resolvedId)
    if (error) return respondDbError('admin:students:status', error)

    // Fire push notification if status changed and student has a linked account
    const pushMsg = STATUS_PUSH[status] ?? null
    if (pushMsg && resolvedUserId && status !== prevStatus) {
      // Keep the Lambda alive until the push HTTP/2 round-trip completes.
      waitUntil(
        sendPushToUsers([resolvedUserId], pushMsg.title, pushMsg.body, {
          type: 'student_status_change',
          newStatus: status,
        }).catch(() => { /* silent */ })
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
