/**
 * API: POST /api/lab-exams/create
 *
 * Cria uma sessão de exame laboratorial (status=pending) e retorna o id.
 * O cliente então sobe os arquivos via /api/lab-exams/signed-upload.
 *
 * Acesso (feature VIP pro+):
 *   - autoavaliação:    user_id = quem chama
 *   - personal mediado: trainer_id = quem chama, user_id = aluno (com vínculo
 *     verificado na tabela students — exame médico é sensível, não basta a RLS).
 *
 * Rate limit: 10 req/min por usuário.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    /** user_id do aluno (fluxo personal). Omitido = autoavaliação. */
    studentUserId: z.string().uuid().nullable().optional(),
    examDate: z.string().max(40).nullable().optional(),
    labName: z.string().max(120).nullable().optional(),
  })
  .strip()

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`lab-exams:create:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    // Gate VIP: feature pro+ (admin/teacher têm acesso ilimitado via role).
    const access = await checkVipFeatureAccess(auth.supabase, userId, 'lab_exams')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'vip_required', message: 'A análise de exames é exclusiva para assinantes VIP. Se você já assina, tente sair e entrar novamente.' },
        { status: 403 },
      )
    }

    const parsed = await parseJsonBody(request, BodySchema)
    if (parsed.response) return parsed.response
    const { studentUserId, examDate, labName } = parsed.data!

    const isTrainerFlow = !!studentUserId && studentUserId !== userId
    const targetUserId = isTrainerFlow ? String(studentUserId) : userId

    const admin = createAdminClient()

    // Fluxo mediado: confirma que o aluno é realmente vinculado a este personal.
    if (isTrainerFlow) {
      const { data: link } = await admin
        .from('students')
        .select('id')
        .eq('teacher_id', userId)
        .eq('user_id', targetUserId)
        .maybeSingle()
      if (!link) {
        return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      }
    }

    const { data, error } = await admin
      .from('lab_exams')
      .insert({
        user_id: targetUserId,
        trainer_id: isTrainerFlow ? userId : null,
        created_by: userId,
        exam_date: examDate ?? null,
        lab_name: labName ?? null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) return respondDbError('lab-exams:create', error)
    const id = String((data as { id?: string } | null)?.id || '')
    if (!id) return NextResponse.json({ ok: false, error: 'create_failed' }, { status: 400 })

    return NextResponse.json({ ok: true, id })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
