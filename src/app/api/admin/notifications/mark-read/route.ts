/**
 * POST /api/admin/notifications/mark-read
 *
 * Body: { id?: string, all?: boolean }
 *   - id presente: marca uma notificação como lida
 *   - all=true: marca TODAS as admin notifications do user como lidas
 *
 * Só admins podem chamar. Restringe por user_id = auth.uid() pra evitar
 * que um admin marque notificações de outro.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const ADMIN_TYPES = ['admin_new_signup', 'admin_vip_expiring', 'admin_access_request']

const BodySchema = z
  .object({
    id: z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.id) || v.all === true, {
    message: 'É preciso passar id ou all=true',
  })

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rlKey = `admin:notifs:mark:${auth.user.id}:${ip}`
    const rl = await checkRateLimitAsync(rlKey, 60, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { id, all } = parsed.data!

    const admin = createAdminClient()
    const userId = String(auth.user.id)

    let q = admin
      .from('notifications')
      .update({ is_read: true, read: true })
      .eq('user_id', userId)
      .in('type', ADMIN_TYPES)

    if (id) q = q.eq('id', id)

    const { error } = await q
    if (error) return respondDbError('admin:notifications:mark-read', error)

    return NextResponse.json({ ok: true, marked: all ? 'all' : id })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
