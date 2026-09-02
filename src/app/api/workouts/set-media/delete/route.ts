import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

/** Remove a mídia (linha + objeto). Só o dono, e só antes/depois — o log da série é atualizado pelo cliente. */
const BodySchema = z.object({ id: z.string().uuid() }).strip()

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const userId = String(auth.user.id)
  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`set-media:delete:${userId}:${ip}`, 30, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  try {
    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response || !parsed.data) return parsed.response ?? NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
    const admin = createAdminClient()
    const { data: row, error } = await admin
      .from('workout_set_media')
      .select('id, bucket_id, object_path')
      .eq('id', parsed.data.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return respondDbError('api:workouts:set-media:delete:read', error)
    if (!row) return NextResponse.json({ ok: true, deleted: false })
    await admin.storage.from(String(row.bucket_id)).remove([String(row.object_path)]).catch(() => null)
    const { error: delErr } = await admin.from('workout_set_media').delete().eq('id', row.id).eq('user_id', userId)
    if (delErr) return respondDbError('api:workouts:set-media:delete', delErr)
    return NextResponse.json({ ok: true, deleted: true })
  } catch (e: unknown) {
    return respondInternalError('api:workouts:set-media:delete', e)
  }
}
