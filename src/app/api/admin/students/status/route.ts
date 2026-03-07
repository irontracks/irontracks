import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { sendPushToUsers } from '@/lib/push/apns'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
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
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: Record<string, unknown> = parsedBody.data!
    const id = String(body?.id || '').trim()
    const status = String(body?.status || '').trim()
    if (!id || !status) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const admin = createAdminClient()

    // Only admin or the student's responsible teacher
    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('teacher_id').eq('id', id).maybeSingle()
      if (!s || s.teacher_id !== auth.user.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Fetch student's linked user_id for push
    const { data: student } = await admin
      .from('students')
      .select('user_id, name, email, status')
      .eq('id', id)
      .maybeSingle()

    // Update status
    const { error } = await admin.from('students').update({ status }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    // Fire push notification if status changed and student has a linked account
    const prevStatus = String(student?.status || '')
    const userId = String(student?.user_id || '').trim()
    const pushMsg = STATUS_PUSH[status] ?? null

    if (pushMsg && userId && status !== prevStatus) {
      // Fire-and-forget — don't block the response
      sendPushToUsers([userId], pushMsg.title, pushMsg.body, {
        type: 'student_status_change',
        newStatus: status,
      }).catch(() => { /* silent */ })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
