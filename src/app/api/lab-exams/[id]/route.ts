/**
 * API: DELETE /api/lab-exams/[id]
 *
 * Apaga um exame: remove os arquivos do bucket privado e deleta a linha
 * (ON DELETE CASCADE remove lab_exam_files). Acesso: dono ou personal.
 *
 * Rate limit: 20 req/min por usuário.
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getErrorMessage } from '@/utils/errorMessage'

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
    if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 400 })
    if (!exam) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const assessedUserId = String((exam as { user_id?: string }).user_id || '')
    const trainerId = (exam as { trainer_id?: string | null }).trainer_id || null
    if (userId !== assessedUserId && userId !== trainerId) {
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
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
