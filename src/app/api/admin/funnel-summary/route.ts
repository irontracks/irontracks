/**
 * GET /api/admin/funnel-summary?days=14
 *
 * Métricas do funil de conversão, agregadas server-side, para alimentar o
 * Story de métricas (`MetricsStoryComposer`). Admin-only.
 *
 * Por que uma rota nova e não a `analytics-summary`: aquela responde
 * ENGAJAMENTO (DAU/WAU/MAU, pushes). Esta responde CONVERSÃO — o ciclo de
 * 02/08/2026: cadastro → wizard → treino criado → trial → paywall → assinante.
 *
 * O cálculo vive em `utils/admin/funnelMetrics.ts` (puro, testável); aqui só
 * há autenticação, leitura e serialização.
 */
import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { buildFunnelMetrics } from '@/utils/admin/funnelMetrics'

export const dynamic = 'force-dynamic'

/** Teto de linhas lidas por consulta — o mesmo patamar de `/admin/acquisition`. */
const SCAN_LIMIT = 50_000

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const rawDays = Number(url.searchParams.get('days'))
    const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 365 ? Math.round(rawDays) : 14
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const admin = createAdminClient()

    const [signupsRes, activityRes, sessionsRes, templatesRes, trialsRes, entitlementsRes] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('user_activity_events').select('user_id, event_name').gte('created_at', since).limit(SCAN_LIMIT),
      admin.from('workouts').select('user_id').eq('is_template', false).gte('created_at', since).limit(SCAN_LIMIT),
      admin.from('workouts').select('user_id').eq('is_template', true).gte('created_at', since).limit(SCAN_LIMIT),
      admin.from('user_entitlements').select('user_id').eq('provider', 'trial').gte('created_at', since).limit(SCAN_LIMIT),
      admin.from('user_entitlements').select('user_id, provider, status, valid_until, metadata').eq('status', 'active'),
    ])

    const metrics = buildFunnelMetrics({
      events: activityRes.data,
      signups: Number(signupsRes.count) || 0,
      sessions: sessionsRes.data,
      templates: templatesRes.data,
      trials: trialsRes.data,
      entitlements: entitlementsRes.data,
    })

    return NextResponse.json({ ok: true, periodDays: days, generatedAt: new Date().toISOString(), metrics })
  } catch (e) {
    return respondInternalError('admin:funnel-summary', e)
  }
}
