import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * GET /api/nutrition/prescribed-plan
 *
 * O ALUNO lê o plano alimentar ATIVO que o professor prescreveu pra ele. Usa o client
 * autenticado do próprio aluno — a RLS (student_diet_plans_select_own) já garante que ele
 * só enxerga o próprio plano; nada de service-role aqui.
 * ────────────────────────────────────────────────────────── */

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const { data, error } = await auth.supabase
      .from('student_diet_plans')
      .select('id, plan_name, meals, notes, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return respondDbError('nutrition:prescribed-plan', error)

    return NextResponse.json({ ok: true, plan: data ?? null })
  } catch (e: unknown) {
    logError('nutrition:prescribed-plan', e)
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
  }
}
