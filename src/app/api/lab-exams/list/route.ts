/**
 * API: GET /api/lab-exams/list?studentUserId=<uuid>
 *
 * Lista os exames do usuário logado (autoavaliação) ou, no fluxo personal,
 * os exames de um aluno vinculado (studentUserId).
 *
 * Retorna metadados + extracted_markers + protocol (JSON) pra a UI montar os
 * cards e abrir o protocolo. NÃO retorna signed URLs dos arquivos (isso fica
 * num endpoint de detalhe sob demanda).
 */
import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'
import type { LabExam } from '@/types/labExam'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const url = new URL(request.url)
    const studentUserId = String(url.searchParams.get('studentUserId') || '').trim()
    const isTrainerFlow = !!studentUserId && studentUserId !== userId

    const admin = createAdminClient()

    let targetUserId = userId
    if (isTrainerFlow) {
      // Confirma vínculo antes de listar exames de outro usuário.
      const { data: link } = await admin
        .from('students')
        .select('id')
        .eq('teacher_id', userId)
        .eq('user_id', studentUserId)
        .maybeSingle()
      if (!link) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
      targetUserId = studentUserId
    }

    const { data, error } = await admin
      .from('lab_exams')
      .select('*')
      .eq('user_id', targetUserId)
      .order('exam_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return respondDbError('lab-exams:list', error)
    return NextResponse.json({ ok: true, exams: (data || []) as unknown as LabExam[] })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
