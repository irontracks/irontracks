import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

/**
 * GET /api/muscle/weekly-summary?week=YYYY-MM-DD
 *
 * Retorna o resumo muscular semanal JÁ cacheado em muscle_weekly_summaries
 * (volumes + insights da IA gerados pelo cron muscle-weekly-insights). É a fonte
 * da tela aberta pela push "Resumo da semana 💪" (deep-link). Sem `week`, devolve
 * a semana mais recente. Filtra sempre pelo usuário autenticado (id do servidor).
 */
export async function GET(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const week = String(new URL(req.url).searchParams.get('week') || '').trim()
  const admin = createAdminClient()

  let query = admin
    .from('muscle_weekly_summaries')
    .select('week_start_date, payload')
    .eq('user_id', auth.user.id)

  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    query = query.eq('week_start_date', week)
  } else {
    query = query.order('week_start_date', { ascending: false }).limit(1)
  }

  const { data, error } = await query.maybeSingle()
  if (error) return respondDbError('muscle:weekly-summary', error)
  if (!data) return NextResponse.json({ ok: true, found: false })

  return NextResponse.json({
    ok: true,
    found: true,
    weekStartDate: data.week_start_date,
    payload: data.payload ?? null,
  })
}
