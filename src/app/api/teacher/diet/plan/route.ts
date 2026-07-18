import { NextResponse } from 'next/server'
import { requireRole } from '@/utils/auth/route'
import { canCoachStudent } from '@/utils/auth/studentAccess'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * GET /api/teacher/diet/plan?studentId=UUID
 *
 * O professor lê o plano alimentar ATIVO que prescreveu pro aluno. Gate canCoachStudent
 * (só aluno DELE, anti-IDOR). Leitura via service-role (a RLS da tabela só deixa o próprio
 * aluno ler; o professor lê pelo gate no código, igual às demais rotas de coaching).
 * ────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const teacherId = String(auth.user.id || '').trim()

    const studentId = String(new URL(req.url).searchParams.get('studentId') || '').trim()
    if (!studentId) return NextResponse.json({ ok: false, error: 'missing_student' }, { status: 400 })

    if (!(await canCoachStudent({ id: teacherId, email: auth.user.email }, studentId))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('student_diet_plans')
      .select('id, plan_name, meals, notes, created_by, created_at, updated_at')
      .eq('user_id', studentId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return respondDbError('teacher:diet:plan', error)

    return NextResponse.json({ ok: true, plan: data ?? null })
  } catch (e: unknown) {
    logError('teacher:diet:plan', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
