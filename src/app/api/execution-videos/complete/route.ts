import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireUser, jsonError } from '@/utils/auth/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const isEnabled = () => String(process.env.ENABLE_EXECUTION_VIDEO || '').trim().toLowerCase() === 'true'

export async function POST(req: Request) {
  if (!isEnabled()) return jsonError(404, 'disabled')

  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const body: any = await req.json().catch(() => ({}))
    const submissionId = String(body?.submission_id || '').trim()
    if (!submissionId) return jsonError(400, 'submission_id_required')

    const admin = createAdminClient()
    const userId = String(auth.user.id)

    const { data, error } = await admin
      .from('exercise_execution_submissions')
      .select('id')
      .eq('id', submissionId)
      .eq('student_user_id', userId)
      .maybeSingle()
    if (error) return jsonError(400, error.message)
    if (!data?.id) return jsonError(404, 'not_found')

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e))
  }
}

