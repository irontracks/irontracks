import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
  perceived_effort: z.number().int().min(1).max(5).nullable().optional(),
})

// PATCH /api/gps/cardio/[id] — update notes / perceived_effort after a session
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('cardio_tracks')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', auth.user.id) // RLS guard — user can only update their own
    .select('id')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}
