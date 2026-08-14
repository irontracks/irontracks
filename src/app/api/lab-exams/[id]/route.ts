/**
 * API: DELETE /api/lab-exams/[id]
 *
 * Apaga um exame: remove os arquivos do bucket privado e deleta a linha
 * (ON DELETE CASCADE remove lab_exam_files). Acesso: dono ou personal.
 *
 * Rate limit: 20 req/min por usuário.
 */
import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { requireUser } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

const BUCKET = 'lab-exams'

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`lab-exams:delete:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const { id } = await ctx.params
    const examId = String(id || '').trim()
    if (!examId) return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 })

    const admin = createAdminClient()

    const { data: exam, error: eErr } = await admin
      .from('lab_exams')
      .select('id, user_id, trainer_id')
      .eq('id', examId)
      .maybeSingle()
    if (eErr) return respondDbError('lab-exams:delete:fetch', eErr)
    if (!exam) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const assessedUserId = String((exam as { user_id?: string }).user_id || '')
    // Gate por VÍNCULO REAL (canCoachStudent), não por row.trainer_id: o trainer_id
    // é gravado na criação e nunca revalidado, então um ex-personal continuava
    // apagando exames do ex-aluno depois do vínculo desfeito (auditoria 2026-07-28).
    if (userId !== assessedUserId && !(await canCoachStudent({ id: userId, email: auth.user.email }, assessedUserId))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Remove os arquivos do storage (best-effort) antes de apagar as linhas.
    const { data: files } = await admin
      .from('lab_exam_files')
      .select('storage_path')
      .eq('exam_id', examId)
    const paths = (files || [])
      .map((f) => String((f as { storage_path?: string }).storage_path || ''))
      .filter(Boolean)
    if (paths.length > 0) {
      await admin.storage.from(BUCKET).remove(paths)
    }

    const { error: delErr } = await admin.from('lab_exams').delete().eq('id', examId)
    if (delErr) return respondDbError('lab-exams:delete', delErr)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return respondInternalError('api:lab-exams:[id]', e)
  }
}
