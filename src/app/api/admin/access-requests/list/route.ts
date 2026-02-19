import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'approved', 'rejected', 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

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
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        page: q.page,
        limit: q.limit,
        total: count,
        totalPages: Math.ceil((count || 0) / q.limit)
      }
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
