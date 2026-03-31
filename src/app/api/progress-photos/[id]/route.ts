/**
 * DELETE /api/progress-photos/[id] — delete a progress photo
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('photos')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.user.id) // RLS double-check

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
