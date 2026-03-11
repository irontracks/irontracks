import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { jsonError, requireRoleWithBearer } from '@/utils/auth/route'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  user_id: z.string().uuid(),
})

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()

    // Auth: require admin or teacher via Bearer token (admin panel sends Authorization header)
    const auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q?.user_id) return jsonError(400, 'user_id required')

    // Use admin client to bypass RLS on user_settings
    const { data, error } = await admin
      .from('user_settings')
      .select('settings')
      .eq('user_id', q.user_id)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, settings: data?.settings ?? null })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
