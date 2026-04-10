import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

async function verifyAccess(req: Request, userId: string) {
  if (!userId) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'missing userId' }, { status: 400 }) }

  const auth = await requireRoleOrBearer(req, ['admin', 'teacher'])
  if (!auth.ok) return { ok: false as const, response: auth.response }

  const admin = createAdminClient()

  // Admins can access any student; teachers only their own
  if (auth.role === 'admin') {
    const { data: student, error } = await admin
      .from('students')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return { ok: false as const, response: NextResponse.json({ ok: false, error: error.message }, { status: 400 }) }
    if (!student) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'student not found' }, { status: 404 }) }
  } else {
    const { data: student, error } = await admin
      .from('students')
      .select('user_id, teacher_id')
      .eq('user_id', userId)
      .eq('teacher_id', auth.user.id)
      .maybeSingle()
    if (error) return { ok: false as const, response: NextResponse.json({ ok: false, error: error.message }, { status: 400 }) }
    if (!student) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'student not found or not yours' }, { status: 403 }) }
  }

  return { ok: true as const, admin }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const access = await verifyAccess(req, userId)
    if (!access.ok) return access.response

    const { data: session, error: sessionError } = await access.admin
      .from('active_workout_sessions')
      .select('user_id, state, started_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (sessionError) return NextResponse.json({ ok: false, error: sessionError.message }, { status: 400 })

    return NextResponse.json({ ok: true, session: session ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const access = await verifyAccess(req, userId)
    if (!access.ok) return access.response

    const body = await req.json() as { state: unknown }
    if (!body?.state) return NextResponse.json({ ok: false, error: 'missing state' }, { status: 400 })

    const state = body.state as Record<string, unknown>
    const startedAtRaw = state?.startedAt
    const startedAtMs = typeof startedAtRaw === 'number'
      ? startedAtRaw
      : new Date(String(startedAtRaw || 0)).getTime()

    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid startedAt in state' }, { status: 400 })
    }

    const { error } = await access.admin
      .from('active_workout_sessions')
      .upsert(
        {
          user_id: userId,
          started_at: new Date(startedAtMs).toISOString(),
          state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
