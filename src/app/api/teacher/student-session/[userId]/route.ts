import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonBody } from '@/utils/zod'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

const PatchBodySchema = z.object({
  // Validação mínima do shape (antes aceitava QUALQUER coisa em state → um payload
  // malformado corrompia a sessão do aluno). startedAt + workout são obrigatórios
  // (é o que o app do aluno espera); passthrough mantém _deviceId/_savedAt/logs/etc.
  state: z.object({
    startedAt: z.union([z.string(), z.number()]),
    workout: z.record(z.unknown()),
    logs: z.record(z.unknown()).optional(),
  }).passthrough(),
}).strip()

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
    if (error) return { ok: false as const, response: respondDbError('teacher:student-session:students-admin', error) }
    if (!student) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'student not found' }, { status: 404 }) }
  } else {
    const { data: student, error } = await admin
      .from('students')
      .select('user_id, teacher_id')
      .eq('user_id', userId)
      .eq('teacher_id', auth.user.id)
      .maybeSingle()
    if (error) return { ok: false as const, response: respondDbError('teacher:student-session:students-teacher', error) }
    if (!student) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'student not found or not yours' }, { status: 403 }) }
  }

  return { ok: true as const, admin, role: auth.role, teacherId: auth.user.id }
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

    if (sessionError) return respondDbError('teacher:student-session:get', sessionError)

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

    const parsedBody = await parseJsonBody(req, PatchBodySchema)
    if (parsedBody.response) return parsedBody.response
    const { state } = parsedBody.data!

    const startedAtRaw = state?.startedAt
    const startedAtMs = typeof startedAtRaw === 'number'
      ? startedAtRaw
      : new Date(String(startedAtRaw || 0)).getTime()

    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid startedAt in state' }, { status: 400 })
    }

    // Merge de logs no servidor: preserva as séries que o ALUNO registrou entre o
    // snapshot que o professor abriu e esta escrita. Sem isso o PATCH substituía o
    // state inteiro e apagava logs recém-feitos (save destrutivo). As chaves que o
    // professor tem vencem; as que só o aluno tem são preservadas.
    let stateToWrite: Record<string, unknown> = state
    try {
      const { data: currentRow } = await access.admin
        .from('active_workout_sessions')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle()
      const curState = currentRow?.state && typeof currentRow.state === 'object' ? currentRow.state as Record<string, unknown> : null
      const curLogs = curState?.logs && typeof curState.logs === 'object' ? curState.logs as Record<string, unknown> : null
      const inLogs = state?.logs && typeof state.logs === 'object' ? state.logs as Record<string, unknown> : null
      if (curLogs && inLogs) {
        stateToWrite = { ...state, logs: { ...curLogs, ...inLogs } }
      }
    } catch { /* best effort — grava o state como veio */ }

    // Guard de controle: um professor só escreve se TEM o controle ATIVO (o aluno
    // aceitou) E é o professor no comando. Admin pode sobrescrever. Antes qualquer
    // professor do aluno gravava mesmo sem o controle liberado, furando o
    // consentimento (pedir → aceitar). Enforçado no WHERE (atômico). UPDATE-only
    // (não upsert): não recria sessão-zumbi se o aluno já finalizou.
    let updateQuery = access.admin
      .from('active_workout_sessions')
      .update({
        started_at: new Date(startedAtMs).toISOString(),
        state: stateToWrite,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (access.role !== 'admin') {
      updateQuery = updateQuery.eq('control_status', 'active').eq('controlled_by', access.teacherId)
    }
    const { data: updated, error } = await updateQuery.select('user_id')

    if (error) return respondDbError('teacher:student-session:update', error)
    if (!updated || updated.length === 0) {
      // 0 linhas: ou a sessão terminou (linha apagada), ou o professor não tem o
      // controle ativo. Distingue os dois pra preservar a detecção de "sessão terminou".
      const { data: exists } = await access.admin
        .from('active_workout_sessions')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (!exists) return NextResponse.json({ ok: false, error: 'session ended' }, { status: 404 })
      return NextResponse.json({ ok: false, error: 'control not active' }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
