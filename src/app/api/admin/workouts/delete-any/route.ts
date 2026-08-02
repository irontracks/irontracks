import { NextResponse } from 'next/server'
import { logWarn } from '@/lib/logger'
import { z } from 'zod'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { deleteTemplateFromSubscribers } from '@/lib/workoutSync'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    confirm: z.boolean(),
    reason: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin'])
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const id = String(body?.id || '').trim()
    const confirm = body?.confirm === true
    const reason = String(body?.reason || '').trim()

    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    if (!confirm || !reason) return NextResponse.json({ ok: false, error: 'confirm_required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: w, error: wErr } = await admin
      .from('workouts')
      .select('id, user_id, created_by, is_template')
      .eq('id', id)
      .maybeSingle()
    if (wErr) return respondDbError('admin:workouts:delete-any', wErr)
    if (!(w as Record<string, unknown>)?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const { data: exs, error: exErr } = await admin.from('exercises').select('id').eq('workout_id', id)
    if (exErr) return respondDbError('admin:workouts:delete-any', exErr)
    const exIds = (exs || []).map((e: unknown) => (e as Record<string, unknown>)?.id).filter(Boolean)
    if (exIds.length) {
      const { error: setsErr } = await admin.from('sets').delete().in('exercise_id', exIds)
      if (setsErr) return respondDbError('admin:workouts:delete-any', setsErr)
    }
    const { error: exDelErr } = await admin.from('exercises').delete().eq('workout_id', id)
    if (exDelErr) return respondDbError('admin:workouts:delete-any', exDelErr)

    const { error: delErr } = await admin.from('workouts').delete().eq('id', id)
    if (delErr) return respondDbError('admin:workouts:delete-any', delErr)

    // Trilha de auditoria — a rota já exigia `reason` e o descartava. Apagar
    // treino de outro usuário (com exercícios e séries em cascata) sem registro
    // de quem e por quê só aparece quando o dono do treino reclama. Mesmo
    // padrão de `admin/vip/revoke`. Best-effort: falha aqui não desfaz a
    // exclusão, que já aconteceu.
    try {
      await admin.from('audit_events').insert({
        actor_id: auth.user?.id || null,
        actor_email: auth.user?.email || null,
        actor_role: 'admin',
        action: 'admin_workout_delete_any',
        entity_type: 'workout',
        entity_id: id,
        metadata: {
          reason,
          owner_user_id: w?.user_id ?? null,
          was_template: w?.is_template === true,
          deleted_exercises: exIds.length,
        },
      })
    } catch (e) { logWarn('admin:workouts:delete-any', 'Failed to write audit_events', e) }

    try {
      const isSourceTemplate = w?.is_template === true && String(w?.user_id || '') === String(w?.created_by || '')
      if (isSourceTemplate) {
        await deleteTemplateFromSubscribers({ sourceUserId: String(w.user_id), sourceWorkoutId: id })
      }
    } catch (e) { logWarn('admin:workouts:delete-any', 'silenced', e) }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}
