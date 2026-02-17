import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { jsonError, requireRole, requireRoleWithBearer, resolveRoleByUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const admin = createAdminClient()
    let auth = await requireRole(['admin'])
    let actorId = ''
    let actorEmail: string | null = null
    let actorRole = 'admin'

    if (auth.ok) {
      actorId = String(auth.user?.id || '').trim()
      actorEmail = auth.user?.email ? String(auth.user.email).trim() : null
      actorRole = String(auth.role || 'admin')
    } else {
      const bearer = await requireRoleWithBearer(req, ['admin'])
      if (bearer.ok) {
        actorId = String(bearer.user?.id || '').trim()
        actorEmail = bearer.user?.email ? String(bearer.user.email).trim() : null
        actorRole = String(bearer.role || 'admin')
      } else {
      const token = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return auth.response
      const { data, error } = await admin.auth.getUser(token)
      const user = data?.user ?? null
      if (error || !user?.id) return auth.response
      const { role } = await resolveRoleByUser({ id: user.id, email: user.email })
      if (role !== 'admin') return jsonError(403, 'forbidden')
      actorId = String(user.id || '').trim()
      actorEmail = user.email ? String(user.email).trim() : null
      actorRole = String(role || 'admin')
      }
    }

    let resolvedTeacherId = id
    try {
      const { data: byTeacherId } = await admin.from('teachers').select('id').eq('id', resolvedTeacherId).maybeSingle()
      if (!byTeacherId?.id) {
        const { data: byUserId } = await admin.from('teachers').select('id').eq('user_id', resolvedTeacherId).maybeSingle()
        if (byUserId?.id) resolvedTeacherId = String(byUserId.id)
      }
    } catch {}

    const { data, error } = await admin.rpc('delete_teacher_cascade', {
      p_teacher_id: resolvedTeacherId,
      p_actor_id: actorId || null,
      p_actor_email: actorEmail,
      p_actor_role: actorRole,
    })

    if (error) {
      const msg = String(error.message || '').trim()
      const lower = msg.toLowerCase()
      if (lower.includes('schema cache') || lower.includes('delete_teacher_cascade')) {
        return NextResponse.json({ ok: false, error: 'Função de exclusão não encontrada. Rode a migration 20260213120000_delete_teacher_cascade.sql no Supabase e tente novamente.' }, { status: 400 })
      }
      return NextResponse.json({ ok: false, error: msg || 'Falha ao excluir' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, report: data ?? null })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
