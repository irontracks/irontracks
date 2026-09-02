import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'
import { logError } from '@/lib/logger'
import { resolveDeliveryStatus, type AuditRow } from '@/utils/email/deliveryStatus'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'approved', 'rejected', 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    const offset = (q.page - 1) * q.limit

    const admin = createAdminClient()

    let query = admin
      .from('access_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + q.limit - 1)

    if (q.status && q.status !== 'all') {
      if (q.status === 'approved') {
        query = query.in('status', ['approved', 'accepted'])
      } else {
        query = query.eq('status', q.status)
      }
    }

    const { data, error, count } = await query

    if (error) {
      return respondDbError('admin:access-requests:list', error)
    }

    // Só nas aprovadas: é a única visão onde a pergunta "o e-mail chegou?" faz
    // sentido — e onde fica o botão de reenviar.
    const rows = (data || []) as Array<Record<string, unknown>>
    const withDelivery = q.status === 'approved'
      ? await attachDeliveryStatus(admin, rows)
      : rows

    return NextResponse.json({
      ok: true,
      data: withDelivery,
      meta: {
        page: q.page,
        limit: q.limit,
        total: count,
        totalPages: Math.ceil((count || 0) / q.limit)
      }
    })
  } catch (e: unknown) {
    return respondInternalError('api:admin:access-requests:list', e)
  }
}

/**
 * Anexa `email_status` a cada solicitação aprovada.
 *
 * Duas consultas para a página inteira, não uma por linha: a lista chega a 200
 * itens e N+1 aqui derrubaria o painel.
 *
 * Nunca lança — se a auditoria falhar, a lista ainda tem de aparecer. O painel
 * mostra "Sem registro", que é a verdade.
 */
async function attachDeliveryStatus(
  admin: ReturnType<typeof createAdminClient>,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const ids = rows.map((r) => String(r.id || '')).filter(Boolean)
  if (!ids.length) return rows

  try {
    const { data: sendRows } = await admin
      .from('audit_events')
      .select('action, entity_id, created_at, metadata')
      .eq('entity_type', 'access_request')
      .in('entity_id', ids)
      .in('action', ['approval_email_sent', 'approval_email_failed'])

    const sends = (sendRows || []) as AuditRow[]
    const byRequest = new Map<string, AuditRow[]>()
    const providerIds: string[] = []
    for (const ev of sends) {
      const key = String(ev.entity_id || '')
      if (!key) continue
      const list = byRequest.get(key) ?? []
      list.push(ev)
      byRequest.set(key, list)
      const pid = String(ev.metadata?.provider_id ?? '')
      if (pid) providerIds.push(pid)
    }

    const byProvider = new Map<string, AuditRow[]>()
    if (providerIds.length) {
      const { data: deliveryRows } = await admin
        .from('audit_events')
        .select('action, entity_id, created_at, metadata')
        .eq('entity_type', 'email')
        .in('entity_id', [...new Set(providerIds)])
      for (const ev of (deliveryRows || []) as AuditRow[]) {
        const key = String(ev.entity_id || '')
        if (!key) continue
        const list = byProvider.get(key) ?? []
        list.push(ev)
        byProvider.set(key, list)
      }
    }

    return rows.map((r) => ({
      ...r,
      email_status: resolveDeliveryStatus(byRequest.get(String(r.id || '')) ?? [], byProvider),
    }))
  } catch (e) {
    logError('admin:access-requests:list', e, { stage: 'delivery_status' })
    return rows
  }
}
