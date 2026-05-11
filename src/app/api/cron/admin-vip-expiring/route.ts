/**
 * GET /api/cron/admin-vip-expiring
 *
 * Daily cron — fires at 12:30 UTC (09:30 BRT).
 *
 * Notifica admins quando alunos VIP têm o plano expirando em 3 dias ou no
 * próximo dia. Diferente de `trial-ending` (que avisa o próprio aluno),
 * aqui o público é o ADMIN, pra que ele possa fazer outreach proativo,
 * renovação manual, ou bloquear o acesso se for o caso.
 *
 * Dois windows:
 *   • 3 dias out  — heads-up pra agir
 *   • 1 dia out   — última chance
 *
 * Read-only — não modifica entitlements.
 */
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/utils/cron/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { notifyAdminVipExpiring } from '@/lib/admin/adminNotifications'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    const now = Date.now()

    // ── Windows: 3 dias e 1 dia ──────────────────────────────────────────
    const threeDaysStart = new Date(now + 64 * 60 * 60 * 1000).toISOString()
    const threeDaysEnd = new Date(now + 72 * 60 * 60 * 1000).toISOString()
    const oneDayStart = new Date(now + 16 * 60 * 60 * 1000).toISOString()
    const oneDayEnd = new Date(now + 24 * 60 * 60 * 1000).toISOString()

    const [{ data: threeDayRows }, { data: oneDayRows }] = await Promise.all([
      admin
        .from('user_entitlements')
        .select('user_id, plan_id, valid_until')
        .not('valid_until', 'is', null)
        .gte('valid_until', threeDaysStart)
        .lt('valid_until', threeDaysEnd)
        .limit(2000),
      admin
        .from('user_entitlements')
        .select('user_id, plan_id, valid_until')
        .not('valid_until', 'is', null)
        .gte('valid_until', oneDayStart)
        .lt('valid_until', oneDayEnd)
        .limit(2000),
    ])

    type Row = { user_id: string | null; plan_id: string | null; valid_until: string | null }

    const allRows: Array<{ row: Row; days: number }> = [
      ...((threeDayRows ?? []) as Row[]).map((r) => ({ row: r, days: 3 })),
      ...((oneDayRows ?? []) as Row[]).map((r) => ({ row: r, days: 1 })),
    ].filter(({ row }) => row.user_id)

    if (!allRows.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no_expiring' })
    }

    // Busca nomes em batch pra evitar N+1
    const userIds = Array.from(new Set(allRows.map(({ row }) => String(row.user_id))))
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds)

    const nameByUser = new Map<string, string>()
    for (const p of Array.isArray(profiles) ? profiles : []) {
      const id = String((p as { id?: string }).id ?? '').trim()
      const name = String(
        (p as { name?: string }).name ||
        (p as { email?: string }).email ||
        'Usuário',
      ).trim()
      if (id) nameByUser.set(id, name)
    }

    let sent = 0
    for (const { row, days } of allRows) {
      const uid = String(row.user_id)
      const userName = nameByUser.get(uid) || 'Usuário'
      const planTier = String(row.plan_id || '').replace(/[._-]/g, '_').toLowerCase()
      try {
        await notifyAdminVipExpiring({
          userId: uid,
          userName,
          daysRemaining: days,
          planTier,
        })
        sent++
      } catch (e) {
        logError('cron:admin-vip-expiring.notify', e, { userId: uid })
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      threeDay: (threeDayRows ?? []).length,
      oneDay: (oneDayRows ?? []).length,
    })
  } catch (e) {
    logError('cron:admin-vip-expiring', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
