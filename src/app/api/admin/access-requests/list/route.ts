import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const admin = createAdminClient()
    
    let query = admin
      .from('access_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ 
        ok: true, 
        data, 
        meta: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil((count || 0) / limit)
        }
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
