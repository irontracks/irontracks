/**
 * GET /api/admin/notifications/list
 *
 * Lista notificações operacionais do próprio admin. Filtra por:
 *   - type LIKE 'admin_*'  (admin_new_signup, admin_vip_expiring, admin_access_request)
 *   - user_id = auth.uid()
 *
 * Retorna até 30 itens, ordenado por created_at DESC. Inclui `unreadCount`
 * pra o badge do sino.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

const ADMIN_TYPES = ['admin_new_signup', 'admin_vip_expiring', 'admin_access_request']

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rlKey = `admin:notifs:list:${auth.user.id}:${ip}`
    const rl = await checkRateLimitAsync(rlKey, 60, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const admin = createAdminClient()
    const userId = String(auth.user.id)

    const { data, error } = await admin
      .from('notifications')
      .select('id, type, title, message, metadata, is_read, created_at')
      .eq('user_id', userId)
      .in('type', ADMIN_TYPES)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      return respondDbError('admin:notifications:list', error)
    }

    const rows = Array.isArray(data) ? data : []
    const unreadCount = rows.filter((r) => !((r as { is_read?: boolean }).is_read)).length

    // Promove metadata.link → link no payload de resposta pra a UI consumir
    // sem ter que conhecer o detalhe interno (link mora em metadata na tabela).
    const enriched = rows.map((r) => {
      const meta = (r as { metadata?: Record<string, unknown> }).metadata
      const link = meta && typeof meta === 'object' ? String((meta as Record<string, unknown>).link || '') : ''
      return { ...r, link: link || null }
    })

    return NextResponse.json({ ok: true, notifications: enriched, unreadCount })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
